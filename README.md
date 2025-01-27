# Using this Action

- Create a labels.json or labels.yaml file in your repository or another
  accessible location.
  - At the moment, only public URLs or local files in the same repository are
    supported.

```yaml
labels:
  - name: 'help wanted'
    color: 'ffeb3b'
    description: Pull Requests for this issue are encouraged
```

- Create a workflow in the repository you want to manage labels for.

```yaml
name: manage-labels
on:
  workflow_dispatch:
    inputs:
      source:
        description: 'Path to labels definition file'
        required: false
        default: .github/labels.json
        type: string
      dry:
        description: 'Dry run (no changes, log only)'
        required: false
        default: true
        type: boolean
      remove_missing:
        description: 'Remove labels not present in the source data'
        required: false
        default: false
        type: boolean
jobs:
  manage-labels:
    permissions:
      contents: read
      issues: write
    runs-on: ubuntu-latest
    name: manage-labels
    steps:
      - uses: actions/checkout@v2
      - uses: TwelveIterations/manage-labels@main
        with:
          dry: ${{ inputs.dry }}
          remove_missing: ${{ inputs.remove_missing }}
          source: ${{ inputs.source }}
        env:
          GITHUB_TOKEN: ${{ github.token }}
```
