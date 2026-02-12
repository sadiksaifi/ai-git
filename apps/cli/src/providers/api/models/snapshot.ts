import type { CatalogModelDefinition, CatalogProviderId } from "./types.ts";

export interface SnapshotProviderData {
  models: Record<string, CatalogModelDefinition>;
}

export const MODEL_CATALOG_SNAPSHOT: Record<CatalogProviderId, SnapshotProviderData> = {
  anthropic: {
    models: {
      "claude-3-5-haiku-20241022": {
        id: "claude-3-5-haiku-20241022",
        name: "Claude Haiku 3.5",
        releaseDate: "2024-10-22",
        lastUpdated: "2024-10-22",
        reasoning: false,
        toolCall: true
      },
      "claude-3-5-haiku-latest": {
        id: "claude-3-5-haiku-latest",
        name: "Claude Haiku 3.5 (latest)",
        releaseDate: "2024-10-22",
        lastUpdated: "2024-10-22",
        reasoning: false,
        toolCall: true
      },
      "claude-3-5-sonnet-20240620": {
        id: "claude-3-5-sonnet-20240620",
        name: "Claude Sonnet 3.5",
        releaseDate: "2024-06-20",
        lastUpdated: "2024-06-20",
        reasoning: false,
        toolCall: true
      },
      "claude-3-5-sonnet-20241022": {
        id: "claude-3-5-sonnet-20241022",
        name: "Claude Sonnet 3.5 v2",
        releaseDate: "2024-10-22",
        lastUpdated: "2024-10-22",
        reasoning: false,
        toolCall: true
      },
      "claude-3-7-sonnet-20250219": {
        id: "claude-3-7-sonnet-20250219",
        name: "Claude Sonnet 3.7",
        releaseDate: "2025-02-19",
        lastUpdated: "2025-02-19",
        reasoning: true,
        toolCall: true
      },
      "claude-3-7-sonnet-latest": {
        id: "claude-3-7-sonnet-latest",
        name: "Claude Sonnet 3.7 (latest)",
        releaseDate: "2025-02-19",
        lastUpdated: "2025-02-19",
        reasoning: true,
        toolCall: true
      },
      "claude-3-haiku-20240307": {
        id: "claude-3-haiku-20240307",
        name: "Claude Haiku 3",
        releaseDate: "2024-03-13",
        lastUpdated: "2024-03-13",
        reasoning: false,
        toolCall: true
      },
      "claude-3-opus-20240229": {
        id: "claude-3-opus-20240229",
        name: "Claude Opus 3",
        releaseDate: "2024-02-29",
        lastUpdated: "2024-02-29",
        reasoning: false,
        toolCall: true
      },
      "claude-3-sonnet-20240229": {
        id: "claude-3-sonnet-20240229",
        name: "Claude Sonnet 3",
        releaseDate: "2024-03-04",
        lastUpdated: "2024-03-04",
        reasoning: false,
        toolCall: true
      },
      "claude-haiku-4-5": {
        id: "claude-haiku-4-5",
        name: "Claude Haiku 4.5 (latest)",
        releaseDate: "2025-10-15",
        lastUpdated: "2025-10-15",
        reasoning: true,
        toolCall: true
      },
      "claude-haiku-4-5-20251001": {
        id: "claude-haiku-4-5-20251001",
        name: "Claude Haiku 4.5",
        releaseDate: "2025-10-15",
        lastUpdated: "2025-10-15",
        reasoning: true,
        toolCall: true
      },
      "claude-opus-4-0": {
        id: "claude-opus-4-0",
        name: "Claude Opus 4 (latest)",
        releaseDate: "2025-05-22",
        lastUpdated: "2025-05-22",
        reasoning: true,
        toolCall: true
      },
      "claude-opus-4-1": {
        id: "claude-opus-4-1",
        name: "Claude Opus 4.1 (latest)",
        releaseDate: "2025-08-05",
        lastUpdated: "2025-08-05",
        reasoning: true,
        toolCall: true
      },
      "claude-opus-4-1-20250805": {
        id: "claude-opus-4-1-20250805",
        name: "Claude Opus 4.1",
        releaseDate: "2025-08-05",
        lastUpdated: "2025-08-05",
        reasoning: true,
        toolCall: true
      },
      "claude-opus-4-20250514": {
        id: "claude-opus-4-20250514",
        name: "Claude Opus 4",
        releaseDate: "2025-05-22",
        lastUpdated: "2025-05-22",
        reasoning: true,
        toolCall: true
      },
      "claude-opus-4-5": {
        id: "claude-opus-4-5",
        name: "Claude Opus 4.5 (latest)",
        releaseDate: "2025-11-24",
        lastUpdated: "2025-11-24",
        reasoning: true,
        toolCall: true
      },
      "claude-opus-4-5-20251101": {
        id: "claude-opus-4-5-20251101",
        name: "Claude Opus 4.5",
        releaseDate: "2025-11-01",
        lastUpdated: "2025-11-01",
        reasoning: true,
        toolCall: true
      },
      "claude-opus-4-6": {
        id: "claude-opus-4-6",
        name: "Claude Opus 4.6",
        releaseDate: "2026-02-05",
        lastUpdated: "2026-02-05",
        reasoning: true,
        toolCall: true
      },
      "claude-sonnet-4-0": {
        id: "claude-sonnet-4-0",
        name: "Claude Sonnet 4 (latest)",
        releaseDate: "2025-05-22",
        lastUpdated: "2025-05-22",
        reasoning: true,
        toolCall: true
      },
      "claude-sonnet-4-20250514": {
        id: "claude-sonnet-4-20250514",
        name: "Claude Sonnet 4",
        releaseDate: "2025-05-22",
        lastUpdated: "2025-05-22",
        reasoning: true,
        toolCall: true
      },
      "claude-sonnet-4-5": {
        id: "claude-sonnet-4-5",
        name: "Claude Sonnet 4.5 (latest)",
        releaseDate: "2025-09-29",
        lastUpdated: "2025-09-29",
        reasoning: true,
        toolCall: true
      },
      "claude-sonnet-4-5-20250929": {
        id: "claude-sonnet-4-5-20250929",
        name: "Claude Sonnet 4.5",
        releaseDate: "2025-09-29",
        lastUpdated: "2025-09-29",
        reasoning: true,
        toolCall: true
      }
    }
  },
  openai: {
    models: {
      "codex-mini-latest": {
        id: "codex-mini-latest",
        name: "Codex Mini",
        releaseDate: "2025-05-16",
        lastUpdated: "2025-05-16",
        reasoning: true,
        toolCall: true
      },
      "gpt-3.5-turbo": {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5-turbo",
        releaseDate: "2023-03-01",
        lastUpdated: "2023-11-06",
        reasoning: false,
        toolCall: false
      },
      "gpt-4": {
        id: "gpt-4",
        name: "GPT-4",
        releaseDate: "2023-11-06",
        lastUpdated: "2024-04-09",
        reasoning: false,
        toolCall: true
      },
      "gpt-4-turbo": {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        releaseDate: "2023-11-06",
        lastUpdated: "2024-04-09",
        reasoning: false,
        toolCall: true
      },
      "gpt-4.1": {
        id: "gpt-4.1",
        name: "GPT-4.1",
        releaseDate: "2025-04-14",
        lastUpdated: "2025-04-14",
        reasoning: false,
        toolCall: true
      },
      "gpt-4.1-mini": {
        id: "gpt-4.1-mini",
        name: "GPT-4.1 mini",
        releaseDate: "2025-04-14",
        lastUpdated: "2025-04-14",
        reasoning: false,
        toolCall: true
      },
      "gpt-4.1-nano": {
        id: "gpt-4.1-nano",
        name: "GPT-4.1 nano",
        releaseDate: "2025-04-14",
        lastUpdated: "2025-04-14",
        reasoning: false,
        toolCall: true
      },
      "gpt-4o": {
        id: "gpt-4o",
        name: "GPT-4o",
        releaseDate: "2024-05-13",
        lastUpdated: "2024-08-06",
        reasoning: false,
        toolCall: true
      },
      "gpt-4o-2024-05-13": {
        id: "gpt-4o-2024-05-13",
        name: "GPT-4o (2024-05-13)",
        releaseDate: "2024-05-13",
        lastUpdated: "2024-05-13",
        reasoning: false,
        toolCall: true
      },
      "gpt-4o-2024-08-06": {
        id: "gpt-4o-2024-08-06",
        name: "GPT-4o (2024-08-06)",
        releaseDate: "2024-08-06",
        lastUpdated: "2024-08-06",
        reasoning: false,
        toolCall: true
      },
      "gpt-4o-2024-11-20": {
        id: "gpt-4o-2024-11-20",
        name: "GPT-4o (2024-11-20)",
        releaseDate: "2024-11-20",
        lastUpdated: "2024-11-20",
        reasoning: false,
        toolCall: true
      },
      "gpt-4o-mini": {
        id: "gpt-4o-mini",
        name: "GPT-4o mini",
        releaseDate: "2024-07-18",
        lastUpdated: "2024-07-18",
        reasoning: false,
        toolCall: true
      },
      "gpt-5": {
        id: "gpt-5",
        name: "GPT-5",
        releaseDate: "2025-08-07",
        lastUpdated: "2025-08-07",
        reasoning: true,
        toolCall: true
      },
      "gpt-5-chat-latest": {
        id: "gpt-5-chat-latest",
        name: "GPT-5 Chat (latest)",
        releaseDate: "2025-08-07",
        lastUpdated: "2025-08-07",
        reasoning: true,
        toolCall: false
      },
      "gpt-5-codex": {
        id: "gpt-5-codex",
        name: "GPT-5-Codex",
        releaseDate: "2025-09-15",
        lastUpdated: "2025-09-15",
        reasoning: true,
        toolCall: true
      },
      "gpt-5-mini": {
        id: "gpt-5-mini",
        name: "GPT-5 Mini",
        releaseDate: "2025-08-07",
        lastUpdated: "2025-08-07",
        reasoning: true,
        toolCall: true
      },
      "gpt-5-nano": {
        id: "gpt-5-nano",
        name: "GPT-5 Nano",
        releaseDate: "2025-08-07",
        lastUpdated: "2025-08-07",
        reasoning: true,
        toolCall: true
      },
      "gpt-5-pro": {
        id: "gpt-5-pro",
        name: "GPT-5 Pro",
        releaseDate: "2025-10-06",
        lastUpdated: "2025-10-06",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.1": {
        id: "gpt-5.1",
        name: "GPT-5.1",
        releaseDate: "2025-11-13",
        lastUpdated: "2025-11-13",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.1-chat-latest": {
        id: "gpt-5.1-chat-latest",
        name: "GPT-5.1 Chat",
        releaseDate: "2025-11-13",
        lastUpdated: "2025-11-13",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.1-codex": {
        id: "gpt-5.1-codex",
        name: "GPT-5.1 Codex",
        releaseDate: "2025-11-13",
        lastUpdated: "2025-11-13",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.1-codex-max": {
        id: "gpt-5.1-codex-max",
        name: "GPT-5.1 Codex Max",
        releaseDate: "2025-11-13",
        lastUpdated: "2025-11-13",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.1-codex-mini": {
        id: "gpt-5.1-codex-mini",
        name: "GPT-5.1 Codex mini",
        releaseDate: "2025-11-13",
        lastUpdated: "2025-11-13",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.2": {
        id: "gpt-5.2",
        name: "GPT-5.2",
        releaseDate: "2025-12-11",
        lastUpdated: "2025-12-11",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.2-chat-latest": {
        id: "gpt-5.2-chat-latest",
        name: "GPT-5.2 Chat",
        releaseDate: "2025-12-11",
        lastUpdated: "2025-12-11",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.2-codex": {
        id: "gpt-5.2-codex",
        name: "GPT-5.2 Codex",
        releaseDate: "2025-12-11",
        lastUpdated: "2025-12-11",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.2-pro": {
        id: "gpt-5.2-pro",
        name: "GPT-5.2 Pro",
        releaseDate: "2025-12-11",
        lastUpdated: "2025-12-11",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.3-codex": {
        id: "gpt-5.3-codex",
        name: "GPT-5.3 Codex",
        releaseDate: "2026-02-05",
        lastUpdated: "2026-02-05",
        reasoning: true,
        toolCall: true
      },
      "gpt-5.3-codex-spark": {
        id: "gpt-5.3-codex-spark",
        name: "GPT-5.3 Codex Spark",
        releaseDate: "2026-02-05",
        lastUpdated: "2026-02-05",
        reasoning: true,
        toolCall: true
      },
      o1: {
        id: "o1",
        name: "o1",
        releaseDate: "2024-12-05",
        lastUpdated: "2024-12-05",
        reasoning: true,
        toolCall: true
      },
      "o1-mini": {
        id: "o1-mini",
        name: "o1-mini",
        releaseDate: "2024-09-12",
        lastUpdated: "2024-09-12",
        reasoning: true,
        toolCall: false
      },
      "o1-preview": {
        id: "o1-preview",
        name: "o1-preview",
        releaseDate: "2024-09-12",
        lastUpdated: "2024-09-12",
        reasoning: true,
        toolCall: false
      },
      "o1-pro": {
        id: "o1-pro",
        name: "o1-pro",
        releaseDate: "2025-03-19",
        lastUpdated: "2025-03-19",
        reasoning: true,
        toolCall: true
      },
      o3: {
        id: "o3",
        name: "o3",
        releaseDate: "2025-04-16",
        lastUpdated: "2025-04-16",
        reasoning: true,
        toolCall: true
      },
      "o3-deep-research": {
        id: "o3-deep-research",
        name: "o3-deep-research",
        releaseDate: "2024-06-26",
        lastUpdated: "2024-06-26",
        reasoning: true,
        toolCall: true
      },
      "o3-mini": {
        id: "o3-mini",
        name: "o3-mini",
        releaseDate: "2024-12-20",
        lastUpdated: "2025-01-29",
        reasoning: true,
        toolCall: true
      },
      "o3-pro": {
        id: "o3-pro",
        name: "o3-pro",
        releaseDate: "2025-06-10",
        lastUpdated: "2025-06-10",
        reasoning: true,
        toolCall: true
      },
      "o4-mini": {
        id: "o4-mini",
        name: "o4-mini",
        releaseDate: "2025-04-16",
        lastUpdated: "2025-04-16",
        reasoning: true,
        toolCall: true
      },
      "o4-mini-deep-research": {
        id: "o4-mini-deep-research",
        name: "o4-mini-deep-research",
        releaseDate: "2024-06-26",
        lastUpdated: "2024-06-26",
        reasoning: true,
        toolCall: true
      },
      "text-embedding-3-large": {
        id: "text-embedding-3-large",
        name: "text-embedding-3-large",
        releaseDate: "2024-01-25",
        lastUpdated: "2024-01-25",
        reasoning: false,
        toolCall: false
      },
      "text-embedding-3-small": {
        id: "text-embedding-3-small",
        name: "text-embedding-3-small",
        releaseDate: "2024-01-25",
        lastUpdated: "2024-01-25",
        reasoning: false,
        toolCall: false
      },
      "text-embedding-ada-002": {
        id: "text-embedding-ada-002",
        name: "text-embedding-ada-002",
        releaseDate: "2022-12-15",
        lastUpdated: "2022-12-15",
        reasoning: false,
        toolCall: false
      }
    }
  },
  google: {
    models: {
      "gemini-1.5-flash": {
        id: "gemini-1.5-flash",
        name: "Gemini 1.5 Flash",
        releaseDate: "2024-05-14",
        lastUpdated: "2024-05-14",
        reasoning: false,
        toolCall: true
      },
      "gemini-1.5-flash-8b": {
        id: "gemini-1.5-flash-8b",
        name: "Gemini 1.5 Flash-8B",
        releaseDate: "2024-10-03",
        lastUpdated: "2024-10-03",
        reasoning: false,
        toolCall: true
      },
      "gemini-1.5-pro": {
        id: "gemini-1.5-pro",
        name: "Gemini 1.5 Pro",
        releaseDate: "2024-02-15",
        lastUpdated: "2024-02-15",
        reasoning: false,
        toolCall: true
      },
      "gemini-2.0-flash": {
        id: "gemini-2.0-flash",
        name: "Gemini 2.0 Flash",
        releaseDate: "2024-12-11",
        lastUpdated: "2024-12-11",
        reasoning: false,
        toolCall: true
      },
      "gemini-2.0-flash-lite": {
        id: "gemini-2.0-flash-lite",
        name: "Gemini 2.0 Flash Lite",
        releaseDate: "2024-12-11",
        lastUpdated: "2024-12-11",
        reasoning: false,
        toolCall: true
      },
      "gemini-2.5-flash": {
        id: "gemini-2.5-flash",
        name: "Gemini 2.5 Flash",
        releaseDate: "2025-03-20",
        lastUpdated: "2025-06-05",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-flash-image": {
        id: "gemini-2.5-flash-image",
        name: "Gemini 2.5 Flash Image",
        releaseDate: "2025-08-26",
        lastUpdated: "2025-08-26",
        reasoning: true,
        toolCall: false
      },
      "gemini-2.5-flash-image-preview": {
        id: "gemini-2.5-flash-image-preview",
        name: "Gemini 2.5 Flash Image (Preview)",
        releaseDate: "2025-08-26",
        lastUpdated: "2025-08-26",
        reasoning: true,
        toolCall: false
      },
      "gemini-2.5-flash-lite": {
        id: "gemini-2.5-flash-lite",
        name: "Gemini 2.5 Flash Lite",
        releaseDate: "2025-06-17",
        lastUpdated: "2025-06-17",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-flash-lite-preview-06-17": {
        id: "gemini-2.5-flash-lite-preview-06-17",
        name: "Gemini 2.5 Flash Lite Preview 06-17",
        releaseDate: "2025-06-17",
        lastUpdated: "2025-06-17",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-flash-lite-preview-09-2025": {
        id: "gemini-2.5-flash-lite-preview-09-2025",
        name: "Gemini 2.5 Flash Lite Preview 09-25",
        releaseDate: "2025-09-25",
        lastUpdated: "2025-09-25",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-flash-preview-04-17": {
        id: "gemini-2.5-flash-preview-04-17",
        name: "Gemini 2.5 Flash Preview 04-17",
        releaseDate: "2025-04-17",
        lastUpdated: "2025-04-17",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-flash-preview-05-20": {
        id: "gemini-2.5-flash-preview-05-20",
        name: "Gemini 2.5 Flash Preview 05-20",
        releaseDate: "2025-05-20",
        lastUpdated: "2025-05-20",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-flash-preview-09-2025": {
        id: "gemini-2.5-flash-preview-09-2025",
        name: "Gemini 2.5 Flash Preview 09-25",
        releaseDate: "2025-09-25",
        lastUpdated: "2025-09-25",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-flash-preview-tts": {
        id: "gemini-2.5-flash-preview-tts",
        name: "Gemini 2.5 Flash Preview TTS",
        releaseDate: "2025-05-01",
        lastUpdated: "2025-05-01",
        reasoning: false,
        toolCall: false
      },
      "gemini-2.5-pro": {
        id: "gemini-2.5-pro",
        name: "Gemini 2.5 Pro",
        releaseDate: "2025-03-20",
        lastUpdated: "2025-06-05",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-pro-preview-05-06": {
        id: "gemini-2.5-pro-preview-05-06",
        name: "Gemini 2.5 Pro Preview 05-06",
        releaseDate: "2025-05-06",
        lastUpdated: "2025-05-06",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-pro-preview-06-05": {
        id: "gemini-2.5-pro-preview-06-05",
        name: "Gemini 2.5 Pro Preview 06-05",
        releaseDate: "2025-06-05",
        lastUpdated: "2025-06-05",
        reasoning: true,
        toolCall: true
      },
      "gemini-2.5-pro-preview-tts": {
        id: "gemini-2.5-pro-preview-tts",
        name: "Gemini 2.5 Pro Preview TTS",
        releaseDate: "2025-05-01",
        lastUpdated: "2025-05-01",
        reasoning: false,
        toolCall: false
      },
      "gemini-3-flash-preview": {
        id: "gemini-3-flash-preview",
        name: "Gemini 3 Flash Preview",
        releaseDate: "2025-12-17",
        lastUpdated: "2025-12-17",
        reasoning: true,
        toolCall: true
      },
      "gemini-3-pro-preview": {
        id: "gemini-3-pro-preview",
        name: "Gemini 3 Pro Preview",
        releaseDate: "2025-11-18",
        lastUpdated: "2025-11-18",
        reasoning: true,
        toolCall: true
      },
      "gemini-embedding-001": {
        id: "gemini-embedding-001",
        name: "Gemini Embedding 001",
        releaseDate: "2025-05-20",
        lastUpdated: "2025-05-20",
        reasoning: false,
        toolCall: false
      },
      "gemini-flash-latest": {
        id: "gemini-flash-latest",
        name: "Gemini Flash Latest",
        releaseDate: "2025-09-25",
        lastUpdated: "2025-09-25",
        reasoning: true,
        toolCall: true
      },
      "gemini-flash-lite-latest": {
        id: "gemini-flash-lite-latest",
        name: "Gemini Flash-Lite Latest",
        releaseDate: "2025-09-25",
        lastUpdated: "2025-09-25",
        reasoning: true,
        toolCall: true
      },
      "gemini-live-2.5-flash": {
        id: "gemini-live-2.5-flash",
        name: "Gemini Live 2.5 Flash",
        releaseDate: "2025-09-01",
        lastUpdated: "2025-09-01",
        reasoning: true,
        toolCall: true
      },
      "gemini-live-2.5-flash-preview-native-audio": {
        id: "gemini-live-2.5-flash-preview-native-audio",
        name: "Gemini Live 2.5 Flash Preview Native Audio",
        releaseDate: "2025-06-17",
        lastUpdated: "2025-09-18",
        reasoning: true,
        toolCall: true
      }
    }
  }
};
