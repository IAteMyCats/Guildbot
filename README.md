# Guildbot

This repository contains a basic Discord bot written in Node.js using
[discord.js](https://discord.js.org/).

## Features

- Sends a configurable welcome message when a member joins the server.

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
3. Run the bot:
   ```bash
   npm start
   ```

The bot currently only implements the welcome message functionality.
Additional features can be added easily.
