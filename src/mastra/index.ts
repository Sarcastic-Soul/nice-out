import { Mastra } from "@mastra/core";
import { guide, storage } from "./agent";

export const mastra = new Mastra({ agents: { guide }, storage });
