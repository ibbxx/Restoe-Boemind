import type { Database } from "../db";
import type { Actor } from "../../auth/session";
import {
  createProject,
  getProjectDetail,
  listProjects,
  updateProject,
  deleteProject,
  type ProjectFormInput,
  type ProjectListFilters,
  type ProjectListRowView,
  type ProjectDetailView,
} from "../../services/projects";
import type { ActionResult } from "../../services/result";
import type { Page } from "../../services/pagination";

export interface IProjectRepository {
  list(actor: Actor, filter?: ProjectListFilters): Promise<ActionResult<Page<ProjectListRowView>>>;
  getById(actor: Actor, id: string): Promise<ActionResult<ProjectDetailView>>;
  create(actor: Actor, input: ProjectFormInput): Promise<ActionResult<unknown>>;
  update(actor: Actor, id: string, input: ProjectFormInput): Promise<ActionResult<unknown>>;
  delete(actor: Actor, id: string): Promise<ActionResult<{ id: string }>>;
}

export function createProjectRepository(db: Database): IProjectRepository {
  return {
    async list(actor, filter) {
      return listProjects(db, actor, filter);
    },
    async getById(actor, id) {
      return getProjectDetail(db, actor, id);
    },
    async create(actor, input) {
      return createProject(db, actor, input);
    },
    async update(actor, id, input) {
      return updateProject(db, actor, id, input);
    },
    async delete(actor, id) {
      return deleteProject(db, actor, id);
    },
  };
}
