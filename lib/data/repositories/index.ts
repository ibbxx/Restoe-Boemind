import type { Database } from "../db";
import { createProjectRepository, type IProjectRepository } from "./project-repository";
import { createVendorRepository, type IVendorRepository } from "./vendor-repository";
import { createAhsRepository, type IAhsRepository } from "./ahs-repository";
import { createScenarioRepository, type IScenarioRepository } from "./scenario-repository";
import { createHistoryRepository, type IHistoryRepository } from "./history-repository";

export interface Repositories {
  projects: IProjectRepository;
  vendors: IVendorRepository;
  ahs: IAhsRepository;
  scenarios: IScenarioRepository;
  history: IHistoryRepository;
}

export function createRepositories(db: Database): Repositories {
  return {
    projects: createProjectRepository(db),
    vendors: createVendorRepository(db),
    ahs: createAhsRepository(db),
    scenarios: createScenarioRepository(db),
    history: createHistoryRepository(db),
  };
}

export * from "./project-repository";
export * from "./vendor-repository";
export * from "./ahs-repository";
export * from "./scenario-repository";
export * from "./history-repository";
