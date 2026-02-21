import { fromPromise } from "xstate";
import {
  select,
  confirm,
  text,
  multiselect,
  isCancel,
} from "@clack/prompts";
import { UserCancelledError } from "../../lib/errors.ts";

// ── Types ────────────────────────────────────────────────────────────

type SelectInput = {
  message: string;
  options: Array<{ value: string; label: string; hint?: string }>;
};

type ConfirmInput = {
  message: string;
  initialValue?: boolean;
};

type TextInput = {
  message: string;
  placeholder?: string;
  initialValue?: string;
  validate?: (value: string) => string | Error | undefined;
};

type MultiselectInput = {
  message: string;
  options: Array<{ value: string; label: string }>;
  required?: boolean;
};

// ── Cancel Sentinel Check ────────────────────────────────────────────

function assertNotCancelled<T>(value: T | symbol): T {
  if (isCancel(value) || typeof value === "symbol") {
    throw new UserCancelledError();
  }
  return value as T;
}

// ── Actor Factories ──────────────────────────────────────────────────

export function createSelectActor(
  resolver: (input: SelectInput) => Promise<string | symbol> = (input) =>
    select(input) as Promise<string | symbol>,
) {
  return fromPromise(async ({ input }: { input: SelectInput }) => {
    const result = await resolver(input);
    return assertNotCancelled(result) as string;
  });
}

export function createConfirmActor(
  resolver: (input: ConfirmInput) => Promise<boolean | symbol> = (input) =>
    confirm(input) as Promise<boolean | symbol>,
) {
  return fromPromise(async ({ input }: { input: ConfirmInput }) => {
    const result = await resolver(input);
    return assertNotCancelled(result) as boolean;
  });
}

export function createTextActor(
  resolver: (input: TextInput) => Promise<string | symbol> = (input) =>
    text(input) as Promise<string | symbol>,
) {
  return fromPromise(async ({ input }: { input: TextInput }) => {
    const result = await resolver(input);
    const value = assertNotCancelled(result) as string;
    return (value ?? "").trim();
  });
}

export function createMultiselectActor(
  resolver: (input: MultiselectInput) => Promise<string[] | symbol> = (input) =>
    multiselect(input) as Promise<string[] | symbol>,
) {
  return fromPromise(async ({ input }: { input: MultiselectInput }) => {
    const result = await resolver(input);
    return assertNotCancelled(result) as string[];
  });
}

// ── Production Singleton Actors ──────────────────────────────────────

export const selectActor = createSelectActor();
export const confirmActor = createConfirmActor();
export const textActor = createTextActor();
export const multiselectActor = createMultiselectActor();

// Re-export types for machine definitions
export type { SelectInput, ConfirmInput, TextInput, MultiselectInput };
