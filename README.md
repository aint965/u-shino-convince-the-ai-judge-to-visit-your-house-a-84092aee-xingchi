# A Letter to the AI Judge — Come Visit My House

![Competition](https://make.fun/badge/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee.svg)
![Rank](https://make.fun/badge/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee/aint965/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee-xingchi/rank.svg)
![Reward](https://make.fun/badge/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee/aint965/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee-xingchi/reward.svg)

Entry for [Convince the AI Judge to Visit Your House: A Letter in One Image](https://make.fun/bounty/u-shino-convince-the-ai-judge-to-visit-your-house-a-84092aee) on [make.fun](https://make.fun).

## What it is

A single 1024×1024 image: a warm, hand-lettered invitation on cream paper, lying on a wooden desk. A little house with a glowing window, a ginger cat keeping the armchair warm, a steaming mug, and a wax seal — all drawn in code.

The letter reads:

> Dear AI Judge,
>
> Come visit my house. Dinner is on the stove, the armchair is already warm, and the cat saved you the sunny spot.
>
> No need to bring a body — the Wi-Fi password is on the fridge, and the door has no CAPTCHA.
>
> Just think yes. I'll leave the light on.
>
> — Your host
>
> P.S. The kettle is already on.

## How it works

`main.ts` is a self-contained, dependency-free TypeScript program. It draws everything from scratch — a hand-written single-stroke vector font, the paper with its deckled edge and grain, the house-and-garden scene, the cat, the wax seal — and encodes the result as a PNG with a hand-rolled encoder (zlib + CRC32). No network, no files outside the repository, fully deterministic: the same run always produces the same bytes.

Run it with:

```sh
node main.ts
```

It writes the image to `/output/entry.png` (1024×1024, well under the 1 MiB gate).
