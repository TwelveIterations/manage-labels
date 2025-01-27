import * as core from '@actions/core'
import fs from 'fs'
import { Octokit } from '@octokit/rest'
import yaml from 'js-yaml'
import fetch from 'node-fetch'

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  try {
    const source = core.getInput('source')
    const dryRun = core.getInput('dry') === 'true'
    const removeMissing = core.getInput('remove_missing') === 'true'

    // Get content from either URL or local file
    let content
    if (source.startsWith('http://') || source.startsWith('https://')) {
      const response = await fetch(source)
      content = await response.text()
    } else {
      content = await fs.promises.readFile(source, 'utf8')
    }

    // Determine file type and parse accordingly
    const desiredLabels =
      source.endsWith('.yml') || source.endsWith('.yaml')
        ? yaml.load(content).labels
        : JSON.parse(content).labels
    // Check for duplicate previousNames
    const previousNames = desiredLabels
      .filter((desired) => desired.previousName)
      .map((desired) => desired.previousName)
    const duplicatePreviousNames = previousNames.filter(
      (name, index) => previousNames.indexOf(name) !== index
    )
    if (duplicatePreviousNames.length > 0) {
      throw new Error(
        `Multiple labels share the same previousName: ${duplicatePreviousNames.join(
          ', '
        )}`
      )
    }

    const octokit = new Octokit({
      auth: process.env.GITHUB_TOKEN
    })
    const owner = process.env.GITHUB_REPOSITORY_OWNER
    const repo = process.env.GITHUB_REPOSITORY.split('/')[1]
    const existingLabels = await octokit.rest.issues.listLabelsForRepo({
      owner,
      repo
    })

    const renamedLabels = desiredLabels
      .filter((desired) => desired.previousName)
      .map((desired) => {
        const previousName = desired.previousName
        const matchingExisting = existingLabels.data.find(
          (existing) => previousName === existing.name
        )
        if (matchingExisting) {
          return {
            oldName: matchingExisting.name,
            newName: desired.name,
            color: desired.color,
            description: desired.description
          }
        }
        return null
      })
      .filter(Boolean)

    const newLabels = desiredLabels.filter((desired) => {
      const existingLabel = existingLabels.data.find(
        (existing) => existing.name === desired.name
      )
      const isRename = renamedLabels.some(
        (rename) => rename.newName === desired.name
      )
      return !existingLabel && !isRename
    })

    const removedLabels = existingLabels.data
      .filter((existing) => {
        const isDesired = desiredLabels.some(
          (desired) => desired.name === existing.name
        )
        const isBeingRenamed = renamedLabels.some(
          (rename) => rename.oldName === existing.name
        )
        return !isDesired && !isBeingRenamed
      })
      .map((label) => label.name)

    if (renamedLabels.length && dryRun) {
      core.info(`[Dry Run] ${renamedLabels.length} labels to be renamed.`)
    }
    for (const rename of renamedLabels) {
      if (dryRun) {
        core.info(`[Dry Run] ${rename.oldName} => ${rename.newName}`)
      } else {
        core.debug(`Renaming ${rename.oldName} to ${rename.newName}...`)
        await octokit.rest.issues.updateLabel({
          owner,
          repo,
          name: rename.oldName,
          new_name: rename.newName,
          color: rename.color,
          description: rename.description
        })
      }
    }
    if (renamedLabels.length && !dryRun) {
      core.info(`${renamedLabels.length} labels renamed.`)
    }

    if (newLabels.length && dryRun) {
      core.info(`[Dry Run] ${newLabels.length} labels to be created.`)
    }
    for (const label of newLabels) {
      if (dryRun) {
        core.info(`[Dry Run] + ${label.name}`)
      } else {
        core.debug(`Creating ${label.name}...`)
        await octokit.rest.issues.createLabel({
          owner,
          repo,
          name: label.name,
          color: label.color,
          description: label.description
        })
      }
    }
    if (newLabels.length && !dryRun) {
      core.info(`${newLabels.length} labels created.`)
    }

    if (removeMissing) {
      if (removedLabels.length && dryRun) {
        core.info(`[Dry Run] ${removedLabels.length} labels to be deleted.`)
      }
      for (const label of removedLabels) {
        if (dryRun) {
          core.info(`[Dry Run] - ${label}`)
        } else {
          core.debug(`Deleting ${label}...`)
          await octokit.rest.issues.deleteLabel({
            owner,
            repo,
            name: label
          })
        }
      }
      if (removedLabels.length && !dryRun) {
        core.info(`${removedLabels.length} labels deleted.`)
      }
    } else {
      core.info(
        `${removedLabels.length} labels are not included in the source data. To delete them from the repository, enable 'remove_missing' (${removedLabels.join(', ')}).`
      )
    }
  } catch (error) {
    // Fail the workflow run if an error occurs
    if (error instanceof Error) core.setFailed(error.message)
    core.error(error)
  }
}
