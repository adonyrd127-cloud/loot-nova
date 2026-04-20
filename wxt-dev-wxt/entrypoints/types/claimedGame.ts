import { Platforms } from "@/entrypoints/enums/platforms.ts";

export type ClaimedGame = {
    title: string;
    platform: Platforms;
    link: string;
    img: string;
    claimedAt: string; // ISO date string
};
