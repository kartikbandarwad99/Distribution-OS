import { invoke as tauriInvoke } from "@tauri-apps/api/core";
import { mockInvoke } from "./mockDb";

export const isTauri =
  typeof window !== "undefined" &&
  (window as any).__TAURI_INTERNALS__ !== undefined;

// Outside Tauri (plain `npm run dev` in a browser) the same commands are served
// by a localStorage-backed stand-in, so the UI can be built and looked at
// without booting the Rust side.
async function invoke<T>(cmd: string, args?: Record<string, any>): Promise<T> {
  if (isTauri) return tauriInvoke<T>(cmd, args);
  return mockInvoke<T>(cmd, args);
}

// ── Vocabulary (§2 of the build spec — these exact strings) ──────────────────

export type Platform = "x" | "instagram" | "threads" | "linkedin";
export type ItemKind =
  | "post"
  | "thread"
  | "carousel"
  | "reel"
  | "image"
  | "article"
  | "note";
export type ItemStatus =
  | "idea"
  | "draft"
  | "scheduled"
  | "published"
  | "failed";
export type TargetStatus = "queued" | "posted" | "failed" | "skipped";
export type ConnectionStatus = "manual" | "connected" | "expired";

export const PLATFORMS: Platform[] = ["x", "instagram", "threads", "linkedin"];

export const PLATFORM_LABEL: Record<Platform, string> = {
  x: "X",
  instagram: "Instagram",
  threads: "Threads",
  linkedin: "LinkedIn",
};

export const KIND_LABEL: Record<ItemKind, string> = {
  post: "Post",
  thread: "Thread",
  carousel: "Carousel",
  reel: "Reel",
  image: "Image",
  article: "Article",
  note: "Note",
};

// ── Types (mirror the Rust structs; fields stay snake_case over the wire) ────

export interface Project {
  id: string;
  name: string;
  description: string | null;
  website: string | null;
  logo_path: string | null;
  is_personal: boolean;
  created_at: string;
  updated_at: string;
}

export interface Account {
  id: string;
  platform: string;
  handle: string;
  display_name: string | null;
  avatar_path: string | null;
  is_global: boolean;
  connection_status: string;
  order_index: number;
  created_at: string;
  updated_at: string;
  project_ids: string[];
  pending_count: number;
}

export interface QueueTarget {
  account_id: string;
  handle: string;
  display_name: string | null;
  platform: string;
  status: string;
  posted_at: string | null;
  external_url: string | null;
  error: string | null;
}

export interface QueueEntry {
  id: string;
  project_id: string;
  title: string;
  kind: string;
  status: string;
  /** Local wall clock, 'YYYY-MM-DDTHH:MM:SS'. null = needs a time. */
  scheduled_for: string | null;
  timezone: string | null;
  body: string | null;
  part_count: number;
  asset_count: number;
  assets: string[];
  targets: QueueTarget[];
}

export interface ContentItem {
  id: string;
  project_id: string;
  folder_id: string | null;
  title: string;
  kind: string;
  platform: string | null;
  body: string | null;
  status: string;
  /** Dead since migration 0003 — read `scheduled_for`. */
  scheduled_at: string | null;
  scheduled_for: string | null;
  timezone: string | null;
  order_index: number;
  asset_count: number;
  cover_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface LibraryItem {
  id: string;
  project_id: string;
  folder_id: string | null;
  title: string;
  kind: string;
  status: string;
  body: string | null;
  scheduled_for: string | null;
  part_count: number;
  asset_count: number;
  assets: string[];
  targets: QueueTarget[];
  created_at: string;
  updated_at: string;
}

export interface ItemPart {
  id: string;
  item_id: string;
  order_index: number;
  body: string;
  created_at: string;
  updated_at: string;
}

export interface ItemAsset {
  id: string;
  item_id: string;
  part_id: string | null;
  file_path: string;
  order_index: number;
  alt_text: string | null;
}

export interface Folder {
  id: string;
  project_id: string;
  parent_id: string | null;
  name: string;
  order_index: number;
  created_at: string;
  updated_at: string;
}

// Projects

export const listProjects = () => invoke<Project[]>("list_projects");

export const createProject = (args: {
  name: string;
  description?: string | null;
  isPersonal?: boolean;
}) =>
  invoke<Project>("create_project", {
    name: args.name,
    description: args.description ?? null,
    isPersonal: args.isPersonal ?? false,
  });

export const updateProject = (args: {
  id: string;
  name?: string;
  description?: string | null;
  website?: string | null;
  logo_path?: string | null;
}) => invoke<Project>("update_project", args);

export const deleteProject = (id: string) =>
  invoke<void>("delete_project", { id });

// Accounts

/** `projectId = null` is "All projects" and returns every account. */
export const listAccounts = (projectId: string | null) =>
  invoke<Account[]>("list_accounts", { projectId });

export const createAccount = (args: {
  platform: Platform;
  handle: string;
  displayName?: string | null;
  isGlobal?: boolean;
  projectIds?: string[];
}) =>
  invoke<Account>("create_account", {
    platform: args.platform,
    handle: args.handle,
    displayName: args.displayName ?? null,
    isGlobal: args.isGlobal ?? false,
    projectIds: args.projectIds ?? [],
  });

// Omit a key to leave it alone; pass null to clear it.
export interface AccountPatch {
  platform?: Platform;
  handle?: string;
  display_name?: string | null;
  avatar_path?: string | null;
  is_global?: boolean;
  connection_status?: ConnectionStatus;
  order_index?: number;
}

export const updateAccount = (id: string, patch: AccountPatch) =>
  invoke<Account>("update_account", { id, patch });

export const setAccountProjects = (
  accountId: string,
  isGlobal: boolean,
  projectIds: string[],
) =>
  invoke<Account>("set_account_projects", { accountId, isGlobal, projectIds });

export const deleteAccount = (id: string) =>
  invoke<void>("delete_account", { id });

// Queue and scheduling

/** `from`/`to` are local 'YYYY-MM-DDTHH:MM:SS'; `to` is exclusive. */
export const listQueue = (args: {
  projectId: string | null;
  from: string;
  to: string;
}) =>
  invoke<QueueEntry[]>("list_queue", {
    projectId: args.projectId,
    from: args.from,
    to: args.to,
  });

export const nextDue = (projectId: string | null) =>
  invoke<QueueEntry | null>("next_due", { projectId });

export const scheduleItem = (
  itemId: string,
  scheduledFor: string,
  timezone?: string | null,
) =>
  invoke<void>("schedule_item", {
    itemId,
    scheduledFor,
    timezone: timezone ?? localTimezone(),
  });

export const unscheduleItem = (itemId: string) =>
  invoke<void>("unschedule_item", { itemId });

export const setItemTargets = (itemId: string, accountIds: string[]) =>
  invoke<void>("set_item_targets", { itemId, accountIds });

export const listItemTargets = (itemId: string) =>
  invoke<QueueTarget[]>("list_item_targets", { itemId });

export const setTargetStatus = (args: {
  itemId: string;
  accountId: string;
  status: TargetStatus;
  externalUrl?: string | null;
  error?: string | null;
}) =>
  invoke<void>("set_target_status", {
    itemId: args.itemId,
    accountId: args.accountId,
    status: args.status,
    externalUrl: args.externalUrl ?? null,
    error: args.error ?? null,
  });

export function localTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "UTC";
  }
}

// Items

export const listLibrary = (args: {
  projectId: string | null;
  kind?: ItemKind | null;
  query?: string | null;
}) =>
  invoke<LibraryItem[]>("list_library", {
    projectId: args.projectId,
    kindFilter: args.kind ?? null,
    query: args.query ?? null,
  });

export const libraryCounts = (projectId: string | null) =>
  invoke<[string, number][]>("library_counts", { projectId });

export const smartListCounts = (projectId: string | null) =>
  invoke<[string, number][]>("smart_list_counts", { projectId });

export const getItem = (id: string) => invoke<ContentItem>("get_item", { id });

export const createItem = (args: {
  projectId: string;
  title: string;
  kind?: ItemKind;
  body?: string | null;
  status?: ItemStatus;
  folderId?: string | null;
}) =>
  invoke<ContentItem>("create_item", {
    projectId: args.projectId,
    folderId: args.folderId ?? null,
    title: args.title,
    kind: args.kind ?? "note",
    body: args.body ?? null,
    status: args.status ?? "idea",
  });

// Omit a key to leave it alone; pass null to clear it.
export interface ItemPatch {
  title?: string;
  kind?: ItemKind;
  body?: string | null;
  status?: ItemStatus;
  scheduled_for?: string | null;
  timezone?: string | null;
  folder_id?: string | null;
  order_index?: number;
}

export const updateItem = (id: string, patch: ItemPatch) =>
  invoke<ContentItem>("update_item", { id, patch });

export const deleteItem = (id: string) => invoke<void>("delete_item", { id });

export const duplicateItem = (id: string) =>
  invoke<ContentItem>("duplicate_item", { id });

// Parts

export const listItemParts = (itemId: string) =>
  invoke<ItemPart[]>("list_item_parts", { itemId });

/** `partId = null` appends. */
export const upsertItemPart = (args: {
  itemId: string;
  partId?: string | null;
  orderIndex?: number | null;
  body: string;
}) =>
  invoke<ItemPart>("upsert_item_part", {
    itemId: args.itemId,
    partId: args.partId ?? null,
    orderIndex: args.orderIndex ?? null,
    body: args.body,
  });

export const deleteItemPart = (partId: string) =>
  invoke<void>("delete_item_part", { partId });

export const reorderItemParts = (itemId: string, orderedIds: string[]) =>
  invoke<void>("reorder_item_parts", { itemId, orderedIds });

// Assets

export const listItemAssets = (itemId: string) =>
  invoke<ItemAsset[]>("list_item_assets", { itemId });

export const addItemAsset = (
  itemId: string,
  sourcePath: string,
  partId?: string | null,
) =>
  invoke<void>("add_item_asset", {
    itemId,
    sourcePath,
    partId: partId ?? null,
  });

export const removeItemAsset = (id: string) =>
  invoke<void>("remove_item_asset", { id });

export const assetAbsPath = (filePath: string) =>
  invoke<string>("asset_abs_path", { filePath });

export const importPaths = (args: {
  projectId: string;
  folderId?: string | null;
  paths: string[];
}) =>
  invoke<ContentItem[]>("import_paths", {
    projectId: args.projectId,
    folderId: args.folderId ?? null,
    paths: args.paths,
  });

// Folders

export const listFolders = (projectId: string | null) =>
  invoke<Folder[]>("list_folders", { projectId });

export const createFolder = (args: {
  projectId: string;
  parentId?: string | null;
  name: string;
}) =>
  invoke<Folder>("create_folder", {
    projectId: args.projectId,
    parentId: args.parentId ?? null,
    name: args.name,
  });

export const renameFolder = (id: string, name: string) =>
  invoke<Folder>("rename_folder", { id, name });

export const deleteFolder = (id: string) =>
  invoke<void>("delete_folder", { id });

// Delivery

/** One account's copy of an item, at the moment it comes due. */
export interface PendingPost {
  item_id: string;
  account_id: string;
  handle: string;
  platform: string;
  title: string;
  scheduled_for: string;
}

/** Everything whose time has passed and is still waiting on you. */
export const listDueNow = () => invoke<PendingPost[]>("list_due_now");

/** Text of every part, joined — what the Copy button puts on the clipboard. */
export const itemClipboardText = (itemId: string) =>
  invoke<string>("item_clipboard_text", { itemId });

/** Open Finder on the item's images. */
export const revealItemAssets = (itemId: string) =>
  invoke<void>("reveal_item_assets", { itemId });

/** Clipboard write that also works in the plain-browser preview. */
export async function copyText(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const area = document.createElement("textarea");
    area.value = text;
    area.style.position = "fixed";
    area.style.opacity = "0";
    document.body.appendChild(area);
    area.select();
    document.execCommand("copy");
    area.remove();
  }
}

// Setup

export const seedDemo = () => invoke<void>("seed_demo");

/**
 * One-time migration of the pre-SQLite accounts list. Accounts used to live in
 * localStorage, which is why they connected to nothing.
 */
const LEGACY_KEY = "distribution-os:connected-accounts";

export async function importLegacyAccounts(): Promise<number> {
  const raw = localStorage.getItem(LEGACY_KEY);
  if (!raw) return 0;
  let rows: any[] = [];
  try {
    rows = JSON.parse(raw);
  } catch {
    localStorage.removeItem(LEGACY_KEY);
    return 0;
  }
  const accounts = rows
    .filter((r) => r && r.platform && r.handle)
    // 'reddit' is not one of the four platforms; it has nowhere to go.
    .filter((r) => PLATFORMS.includes(r.platform))
    .map((r) => ({
      platform: r.platform,
      handle: r.handle,
      label: r.label ?? null,
      project_id: r.projectId ?? null,
    }));
  if (accounts.length) {
    await invoke<Account[]>("import_legacy_accounts", { accounts });
  }
  localStorage.removeItem(LEGACY_KEY);
  return accounts.length;
}
