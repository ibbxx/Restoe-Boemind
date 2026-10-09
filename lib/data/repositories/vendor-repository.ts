import type { Database } from "../db";
import { eq, searchAcross } from "../db";
import { toRange } from "../../services/pagination";
import type { VendorListFilters } from "../../services/vendors";
import type { ProjectVendor, Vendor, VendorPrice } from "../../types/domain";

export interface IVendorRepository {
  list(filter?: VendorListFilters): Promise<{ rows: Vendor[]; count: number }>;
  getById(id: string): Promise<Vendor | null>;
  findByName(name: string): Promise<Vendor | null>;
  create(input: Partial<Vendor>): Promise<Vendor>;
  update(id: string, patch: Partial<Vendor>): Promise<Vendor>;
  
  getProjectLinks(vendorIds: string[]): Promise<{ vendor_id: string; project_id: string }[]>;
  getPrices(vendorIds: string[]): Promise<{ vendor_id: string }[]>;

  // Project Vendor Links
  getProjectLink(projectId: string, vendorId: string): Promise<ProjectVendor | null>;
  getProjectLinkById(linkId: string): Promise<ProjectVendor | null>;
  createProjectLink(data: Partial<ProjectVendor>): Promise<ProjectVendor>;
  updateProjectLink(linkId: string, patch: Partial<ProjectVendor>): Promise<ProjectVendor>;
  removeProjectLink(linkId: string): Promise<void>;
  
  // Project-specific methods
  listProjectVendors(projectId: string): Promise<ProjectVendor[]>;
  listProjectVendorsData(vendorIds: string[]): Promise<Vendor[]>;
  listProjectVendorPrices(projectId: string, vendorIds: string[]): Promise<VendorPrice[]>;
  listAllProjectVendorPrices(projectId: string): Promise<VendorPrice[]>;

  // Vendor Prices
  getLatestPrice(projectId: string, vendorId: string): Promise<VendorPrice | null>;
  createPrice(data: Partial<VendorPrice>): Promise<VendorPrice>;
  updatePrice(id: string, patch: Partial<VendorPrice>): Promise<VendorPrice>;
}

export function createVendorRepository(db: Database): IVendorRepository {
  return {
    async list(filter = {}) {
      const page = filter.page && filter.page > 0 ? filter.page : 1;
      const pageSize = filter.pageSize && filter.pageSize > 0 ? filter.pageSize : 20;
      const where = [];
      if (filter.status) where.push(eq("status", filter.status));
      const or = searchAcross(["name", "contact", "armada", "permit"], filter.search ?? "");

      return db.select<Vendor>("vendors", {
        where,
        ...(or ? { or } : {}),
        order: [{ column: "name", ascending: true }],
        range: toRange(page, pageSize),
        count: true,
      });
    },

    async getById(id) {
      const { rows } = await db.select<Vendor>("vendors", { where: [eq("id", id)], limit: 1 });
      return rows[0] || null;
    },

    async findByName(name) {
      const { rows } = await db.select<Vendor>("vendors", { where: [eq("name", name)], limit: 1 });
      return rows[0] || null;
    },

    async create(input) {
      return db.insert<Vendor>("vendors", input as Record<string, unknown>);
    },

    async update(id, patch) {
      return db.update<Vendor>("vendors", id, patch as Record<string, unknown>);
    },

    async getProjectLinks(vendorIds) {
      if (vendorIds.length === 0) return [];
      const { rows } = await db.select<{ vendor_id: string; project_id: string }>("project_vendors", {
        where: [{ column: "vendor_id", op: "in", value: vendorIds }],
      });
      return rows;
    },

    async getPrices(vendorIds) {
      if (vendorIds.length === 0) return [];
      const { rows } = await db.select<{ vendor_id: string }>("vendor_prices", {
        where: [{ column: "vendor_id", op: "in", value: vendorIds }],
      });
      return rows;
    },

    async getProjectLink(projectId, vendorId) {
      const { rows } = await db.select<ProjectVendor>("project_vendors", {
        where: [eq("project_id", projectId), eq("vendor_id", vendorId)],
        limit: 1,
      });
      return rows[0] || null;
    },

    async getProjectLinkById(linkId) {
      const { rows } = await db.select<ProjectVendor>("project_vendors", {
        where: [eq("id", linkId)],
        limit: 1,
      });
      return rows[0] || null;
    },

    async createProjectLink(data) {
      return db.insert<ProjectVendor>("project_vendors", data as Record<string, unknown>);
    },

    async updateProjectLink(linkId, patch) {
      return db.update<ProjectVendor>("project_vendors", linkId, patch as Record<string, unknown>);
    },

    async removeProjectLink(linkId) {
      await db.remove("project_vendors", linkId);
    },

    async listProjectVendors(projectId) {
      const { rows } = await db.select<ProjectVendor>("project_vendors", {
        where: [eq("project_id", projectId)],
        order: [{ column: "created_at", ascending: true }],
      });
      return rows;
    },

    async listProjectVendorsData(vendorIds) {
      if (vendorIds.length === 0) return [];
      const { rows } = await db.select<Vendor>("vendors", { 
        where: [{ column: "id", op: "in", value: vendorIds }] 
      });
      return rows;
    },

    async listProjectVendorPrices(projectId, vendorIds) {
      if (vendorIds.length === 0) return [];
      const { rows } = await db.select<VendorPrice>("vendor_prices", {
        where: [
          eq("project_id", projectId),
          { column: "vendor_id", op: "in", value: vendorIds },
        ],
        order: [{ column: "updated_at", ascending: false }],
      });
      return rows;
    },

    async listAllProjectVendorPrices(projectId) {
      const { rows } = await db.select<VendorPrice>("vendor_prices", {
        where: [eq("project_id", projectId)],
        order: [{ column: "created_at", ascending: true }],
      });
      return rows;
    },

    async getLatestPrice(projectId, vendorId) {
      const { rows } = await db.select<VendorPrice>("vendor_prices", {
        where: [eq("project_id", projectId), eq("vendor_id", vendorId)],
        order: [{ column: "updated_at", ascending: false }],
        limit: 1,
      });
      return rows[0] || null;
    },

    async createPrice(data) {
      return db.insert<VendorPrice>("vendor_prices", data as Record<string, unknown>);
    },

    async updatePrice(id, patch) {
      return db.update<VendorPrice>("vendor_prices", id, patch as Record<string, unknown>);
    }
  };
}
