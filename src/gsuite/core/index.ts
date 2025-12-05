/**
 * GSuite Core Module - Foundation Components
 *
 * This module contains the core building blocks for Google Workspace integration:
 * - GSuite: Main integration manager for multi-organization setups
 * - GSuiteUser: User-specific service access facade
 * - GSuiteAdmin: Administrative operations and directory management
 * - GSuiteOrgConfig: Organization configuration and authentication
 *
 * These components provide the foundation for all Google Workspace services
 * including authentication, user management, and organizational structure.
 *
 * @module GSuiteCore
 * @version 1.0.0
 * @author Divizend GmbH
 */

export * from "./GSuite";
export * from "./GSuiteUser";
export * from "./GSuiteAdmin";
export * from "./GSuiteOrgConfig";
