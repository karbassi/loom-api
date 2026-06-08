export interface CommandDef {
  desc: string;
  usage: string;
  examples?: string[];
}

export interface AuthCookie {
  name: string;
  value: string;
  domain: string;
  expires?: number;
}

export interface AuthState {
  cookies: AuthCookie[];
}

export interface AuthResult {
  cookies: string;
  sid: AuthCookie | null;
}

export interface WriteFlags {
  dryRun: boolean;
  yes: boolean;
  force: boolean;
  json: boolean;
  [key: string]: string | boolean;
}

export interface ParsedWriteArgs {
  flags: WriteFlags;
  positional: string[];
}

export interface Colors {
  red: (s: string) => string;
  green: (s: string) => string;
  yellow: (s: string) => string;
  cyan: (s: string) => string;
  bold: (s: string) => string;
  dim: (s: string) => string;
}

export interface Spinner {
  stop: () => void;
}

export interface VideoOwner {
  id: string;
  display_name: string;
  avatars?: { thumb?: string; large?: string };
}

export interface Video {
  id: string;
  name: string;
  visibility?: string;
  createdAt?: string;
  playable_duration?: number;
  tags?: string[];
  complete?: boolean;
  comments_enabled?: boolean;
  owner?: VideoOwner;
  views?: { total?: number; distinct?: number };
  totalComments?: number;
  totalReactions?: number;
  video_properties?: { width?: number; height?: number; screen_type?: string };
  signedDefaultThumbnails?: { default?: string; static?: string };
  organization?: { id: string; name: string };
  calendarMeetingGuid?: string;
  storage?: string;
  description?: string;
  meetingNotesPage?: { pageUrl?: string };
  video_comments?: Comment[];
}

export interface PaginatedResult<T> {
  videos: T[];
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface Comment {
  id: string;
  content: string;
  time_stamp: number | null;
  user_name: string;
  createdAt: string;
  children_comments?: Comment[];
}

export interface Task {
  id: string;
  video_id: string;
  content: string;
  time_stamp: number | null;
  activity_type?: string;
  source?: string;
  createdAt: string;
  approved_at: string | null;
  resolved_at: string | null;
  owner?: { id: string; display_name: string };
  responses?: { id: string; responded_at: string; user: { id: string; display_name: string } }[];
}

export interface Reaction {
  id: string;
  time: number | null;
  reaction: string;
  extended_reaction: string;
  category: string;
  user?: { id: string; display_name: string };
  anon_user_id?: string;
  anon_user_name?: string;
}

export interface Folder {
  id: string;
  name: string;
  visibility?: string;
  createdAt?: string;
  updatedAt?: string;
  created_by?: { id: string; display_name: string };
}

export interface Space {
  id: string;
  name: string;
  privacy?: string;
  is_primary?: boolean;
}

export interface User {
  id: string;
  display_name: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  company_name?: string;
  companyPosition?: string;
  avatars?: { thumb?: string; large?: string };
}

export interface CommentReaction {
  id: string;
  userName: string;
  extendedReaction: string;
  createdAt: string;
}

export interface Backlink {
  id: string;
  source: string;
  sourceLink: string;
  title: string;
  isSynced: boolean;
}

export interface ConfluencePage {
  url: string;
  title: string;
}

export interface TranscriptPhrase {
  timestamp: number;
  speaker: string | null;
  text: string;
}

export interface TranscriptDetails {
  idv2: string;
  video_id: string;
  version: string;
  transcript_url: string;
  captions_url: string;
  source_url: string;
  captions_source_url: string;
  transcription_status: string;
  processing_service: string;
  language: string;
}

export interface ChaptersResult {
  id?: string;
  video_id?: string;
  content: string;
  schema_version?: string;
  updatedAt?: string;
  edited_at?: string;
  auto_chapter_status?: string;
}

export interface SummaryResult {
  id?: string;
  autoDescription: string;
  autoDescriptionStatus?: string;
}

export interface PaginatedFolders {
  folders: Folder[];
  endCursor: string | null;
  hasNextPage: boolean;
}

export interface PaginatedSpaces {
  spaces: Space[];
  endCursor: string | null;
  hasNextPage: boolean;
}
