/**
 * Lightweight localStorage-backed project store. Each project carries its
 * SynthJS source plus metadata (name, last modified). The active project ID
 * is tracked separately so the shell can re-open the user's last session.
 *
 * Schema (localStorage keys):
 *   synthjs.projects.v1     → JSON array of Project records
 *   synthjs.activeProject   → string ID of the active project
 *
 * No backend; persistence is purely browser-local for now.
 */

const STORAGE_KEY = "synthjs.projects.v1";
const ACTIVE_KEY = "synthjs.activeProject";

const DEFAULT_SOURCE = `\\version "2.0"
\\tempo 100
\\time 4/4

voice melody {
  4 c4 d e f  4 g a b c5
}
`;

function uid() {
  return `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (p) => p && typeof p.id === "string" && typeof p.source === "string",
    );
  } catch {
    return [];
  }
}

function writeAll(list) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch (err) {
    console.warn("projects: storage write failed", err);
  }
}

export function listProjects() {
  return readAll().sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
}

export function getProject(id) {
  return readAll().find((p) => p.id === id) ?? null;
}

export function getActiveProjectId() {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

export function setActiveProjectId(id) {
  try {
    if (id) localStorage.setItem(ACTIVE_KEY, id);
    else localStorage.removeItem(ACTIVE_KEY);
  } catch {}
}

export function createProject({ name, source } = {}) {
  const list = readAll();
  const project = {
    id: uid(),
    name: name?.trim() || `untitled ${list.length + 1}`,
    source: source ?? DEFAULT_SOURCE,
    lastModified: Date.now(),
  };
  list.push(project);
  writeAll(list);
  return project;
}

export function updateProject(id, patch) {
  const list = readAll();
  const idx = list.findIndex((p) => p.id === id);
  if (idx < 0) return null;
  const prev = list[idx];
  const next = {
    ...prev,
    ...patch,
    id: prev.id,
    lastModified: Date.now(),
  };
  list[idx] = next;
  writeAll(list);
  return next;
}

export function deleteProject(id) {
  const list = readAll();
  const filtered = list.filter((p) => p.id !== id);
  if (filtered.length === list.length) return false;
  writeAll(filtered);
  if (getActiveProjectId() === id) setActiveProjectId(null);
  return true;
}

export function duplicateProject(id) {
  const original = getProject(id);
  if (!original) return null;
  return createProject({
    name: `${original.name} copy`,
    source: original.source,
  });
}

/**
 * Ensure at least one project exists; return the active one (or the most
 * recently modified project if no active selection persists).
 */
export function ensureActiveProject(seedSource) {
  const projects = readAll();
  if (projects.length === 0) {
    const seeded = createProject({ name: "showcase", source: seedSource });
    setActiveProjectId(seeded.id);
    return seeded;
  }
  const activeId = getActiveProjectId();
  if (activeId) {
    const found = projects.find((p) => p.id === activeId);
    if (found) return found;
  }
  // Fall back to the most recently modified.
  const sorted = [...projects].sort((a, b) => (b.lastModified ?? 0) - (a.lastModified ?? 0));
  setActiveProjectId(sorted[0].id);
  return sorted[0];
}
