export type ResourceType =
  | 'pdf'
  | 'mp4'
  | 'zip'
  | 'm3u8'
  | 'vtt'
  | 'docx'
  | 'pptx'
  | 'xlsx'
  | 'rar'
  | 'other';

export type ResourceStatus =
  | 'discovered'
  | 'downloadable_allowed'
  | 'skipped_streaming'
  | 'download_started'
  | 'download_complete'
  | 'download_failed';

export interface RawResource {
  url: string;
  title: string;
  type: ResourceType;
  /** For VTT files discovered inside an m3u8 playlist */
  parentM3u8Url?: string;
}

export interface Resource {
  id: string;
  url: string;
  filename: string;
  title: string;
  type: ResourceType;
  status: ResourceStatus;
  downloadPath?: string;
  downloadId?: number;
  error?: string;
  discoveredAt: string;
  completedAt?: string;
  /** VTT files embedded in this m3u8 playlist */
  subtitleUrls?: string[];
  parentM3u8Url?: string;
}

export interface RawLesson {
  title: string;
  url: string;
}

export interface Lesson {
  id: string;
  index: number;
  title: string;
  url: string;
  resources: Resource[];
  visited: boolean;
  visitedAt?: string;
}

export interface Module {
  id: string;
  index: number;
  title: string;
  url?: string;
  lessons: Lesson[];
}

export interface CourseData {
  title: string;
  url: string;
  domain: string;
  scannedAt: string;
  completedAt?: string;
  modules: Module[];
}

export interface CrawlOptions {
  maxPages: number;
  sameOriginOnly: boolean;
  delayMs: number;
  sanitizeFilenames: boolean;
  onlyExportIndex: boolean;
}

export const DEFAULT_OPTIONS: CrawlOptions = {
  maxPages: 200,
  sameOriginOnly: true,
  delayMs: 300,
  sanitizeFilenames: true,
  onlyExportIndex: false,
};

export type CrawlStatus =
  | 'idle'
  | 'scanning'
  | 'scan_complete'
  | 'downloading'
  | 'complete'
  | 'error'
  | 'paused';

export interface CrawlProgress {
  pagesVisited: number;
  totalPages: number;
  resourcesFound: number;
  resourcesDownloaded: number;
  resourcesFailed: number;
}

export interface LogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'success';
  message: string;
}

export interface CrawlState {
  status: CrawlStatus;
  course?: CourseData;
  options: CrawlOptions;
  queue: string[];
  visited: string[];
  logs: LogEntry[];
  progress: CrawlProgress;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

/** Data returned by content script extraction function */
export interface PageExtractionResult {
  courseTitle: string;
  pageTitle: string;
  lessonLinks: RawLesson[];
  resources: RawResource[];
  /** Suggested module name from page breadcrumb/nav */
  moduleTitle?: string;
}
