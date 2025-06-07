# Guildbot

This repository contains a basic Discord bot written in Node.js using
[discord.js](https://discord.js.org/).

## Features

- Sends a configurable welcome message when a member joins the server.
1. Install dependencies (requires Node.js 16 or later):
- Provides a `/test-welcome` slash command to send the welcome message for
  testing purposes.
=======
 main

## Setup

1. Install dependencies:
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your values (the `.env` file is
   ignored by Git):
   - `DISCORD_TOKEN` &ndash; your bot token
   - `WELCOME_CHANNEL_ID` &ndash; ID of the channel where welcome messages
     should be sent
 pwojb8-codex/add-welcome-message-function
   - `GUILD_ID` &ndash; ID of your Discord server for registering slash commands
=======
 main
3. Run the bot:
   ```bash
   npm start
   ```

 pwojb8-codex/add-welcome-message-function
If `GUILD_ID` is provided, the `/test-welcome` command will be registered for
that server instantly. Without it, commands are registered globally and may take
up to an hour to appear.

=======
 main
The bot currently only implements the welcome message functionality.
Additional features can be added easily.
