# PsyGames Mini Apps

Nine short browser games that introduce players to the full PsyGames app.

- Live catalog: <https://psy-games.pro/mini/>
- Download page: <https://psy-games.pro/download/>
- Default language: English

## Local development

```bash
npm ci
npm run dev
```

The catalog is served under `/mini/`. A direct game URL follows the same pattern:
`/mini/schulte-speed/`.

## Checks

```bash
npm test
npm run build
npm run qa:mobile
```

The conversion CTA keeps the source platform and selected game in UTM parameters,
then sends the player to the multi-platform PsyGames download page.
