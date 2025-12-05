/**
 * GSuite Module - Google Workspace Integration
 *
 * This module provides comprehensive integration with Google Workspace services
 * including Gmail, Google Drive, Google Sheets, Google Docs, and administrative
 * functions.
 *
 * The module is organized into specialized submodules:
 * - core: Organization management and user authentication
 * - gmail: Email processing and management
 * - drive: File storage and management
 * - spreadsheets: Data analysis and spreadsheet operations
 * - documents: Document creation and processing
 *
 * All services support multi-organization deployments with proper isolation
 * and enterprise-grade security through service account authentication.
 *
 * @module GSuite
 * @version 1.0.0
 * @author Divizend GmbH
 */

export * from "./core";
export * from "./documents";
export * from "./drive";
export * from "./gmail";
export * from "./spreadsheets";
