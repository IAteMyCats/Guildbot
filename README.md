# Guildbot

This repository contains a basic Discord bot written in Node.js using
[discord.js](https://discord.js.org/).

## Features

- Sends a configurable welcome message when a member joins the server using an
  embed.
- Provides a `/test-welcome` slash command to send the welcome embed for
  testing purposes.
- Allows users to set their birthdays with `/birthday` and lists upcoming
  birthdays with `/birthdaylist` in an embed.
- `/birthdaylist` shows entries like `January 5th, username turns 30`.
- Celebrates birthdays automatically with randomized embed messages and offers
  `/test-birthday` for testing.
- Link a Minecraft username with `/connect <username>` which updates the member's
  nickname and assigns roles based on their Hypixel rank.
- Use `/test-connect` to test the Hypixel linking feature.
- Maintains a player database in a channel, keeping one message per user up to
  date with their details, including each member's monthly guild XP total.
  The database refreshes for all members whenever the bot starts.
- Posts a weekly guild XP ranking in a configured channel with `/test-guildxp`
  available for on-demand reports. Each member is listed on its own line in a
  diff-styled code block with columns for rank, Discord name, Minecraft name and
  weekly XP. Players who joined recently are prefixed with a `+` so the row
  appears green. Those who earn no XP for four consecutive weeks (and aren’t
  new) are prefixed with a `-` so their row shows
  in red. Discord names are shown without pings, and the report splits into
  multiple embeds if it exceeds Discord's size limits. Inactivity is tracked
  using a local `guildxp_history.json` file.

## Setup

1. Install dependencies (requires Node.js 18 or later):
   ```bash
   npm install
   ```
2. Copy `.env.example` to `.env` and fill in your values (the `.env` file is
   ignored by Git):
    - `DISCORD_TOKEN` &ndash; your bot token
    - `WELCOME_CHANNEL_ID` &ndash; ID of the channel where welcome messages
      should be sent
    - `BIRTHDAY_CHANNEL_ID` &ndash; channel for birthday announcements (falls
      back to `WELCOME_CHANNEL_ID` if not set)
- `DATABASE_CHANNEL_ID` &ndash; channel where player database messages are
  stored
- `GUILD_XP_CHANNEL_ID` &ndash; channel where weekly guild XP reports are sent
- `GUILD_ID` &ndash; ID of your Discord server for registering slash commands
- `HYPIXEL_API_KEY` &ndash; API key for fetching Hypixel player data
- `HYPIXEL_GUILD_NAME` &ndash; name of your Hypixel guild (default
  `Troopas Dynasty`)
- `RANK_UNRANKED_ROLE_ID`, `RANK_VIP_ROLE_ID`, `RANK_VIP_PLUS_ROLE_ID`,
  `RANK_MVP_ROLE_ID`, `RANK_MVP_PLUS_ROLE_ID`, `RANK_MVP_PLUS_PLUS_ROLE_ID`
  &ndash; Discord role IDs for each rank
- `GUILD_MEMBER_ROLE_ID` &ndash; role ID to apply when the player is a member
  of your Hypixel guild
3. Run the bot:
   ```bash
   npm start
   ```

If `GUILD_ID` is provided, the `/test-welcome` command will be registered for
that server instantly. Without it, commands are registered globally and may take
up to an hour to appear.

The bot currently supports welcome messages, birthdays, Hypixel linking and
weekly guild XP reports with more to come.