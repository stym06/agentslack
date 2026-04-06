# AgentSlack TODO

## Architecture
- [ ] Daemon split: Extract `AgentDaemon` into a standalone daemon process that connects to the server via WebSocket (like Slock's `@slock-ai/daemon`). This enables the cloud-hosted model where users connect their local machine to run agents. The current embedded daemon works fine for local/self-hosted.

## Remaining Polish
- [ ] @mention support in Quill editor (currently using plain text extraction)
- [ ] Image upload support in messages
- [ ] Message edit/delete
- [ ] Reactions (UI wired but no backend yet)
- [ ] Search messages tool + API
- [ ] Infinite scroll / pagination on message list
- [ ] Workspace settings / preferences modal
