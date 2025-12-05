# Scratch for Business Process Automation

## Short links

- [Admin interface](/admin)

## Introduction

The code from this website can be run by visiting the following website: [https://sheeptester.github.io/scratch-gui/?url=https://scratch.divizend.ai/julian-nalenz.js](https://sheeptester.github.io/scratch-gui/?url=https://scratch.divizend.ai/julian-nalenz.js)

The web server defined in this repository ([github.com/divizend/scratch](https://github.com/divizend/scratch)) is currently deployed at [scratch.divizend.ai](https://scratch.divizend.ai).

## Setup

1. `cp .env.example .env`
2. Add your own `WEB_UI_JWT_SECRET` in your `.env`
3. Run `bun install`
4. Run `bun tools/generate-token.ts`
5. Run `bun run dev`
6. Visit http://localhost:3000 and click on "Admin interface"
7. Enter the token you generated in step 4
8. 
