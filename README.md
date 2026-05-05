# cuco-studio-plugin

Claude Code plugin for video creation with cuco CLI.

## Install

```bash
claude plugin marketplace add cifarra/cuco-studio-plugin
```

## Key Concept

**Arrangement = version.** Immutable. Different style = new arrangement.

## Quick Start

```bash
cuco project create --name "My Video"
# Copy media to ~/Library/Application Support/CucoStudio/projects/{id}/attached_media/
cuco storyboard update {id} --file storyboard.json
cuco arrangement create {id} --patch-json '{"style_id": 7}'
cuco arrangement process {id} {arr_id} --render --style-id=7 --wait
```

Output: `~/Library/Application Support/CucoStudio/projects/{id}/arrangements/{arr_id}/video.mp4`
