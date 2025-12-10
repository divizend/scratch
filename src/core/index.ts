/**
 * Core Module - Foundation Components
 *
 * This module contains the fundamental building blocks of the AI Executive system:
 * - Universe: Central orchestration and configuration management
 * - Fragment: Abstract interface for all content types (emails, documents, etc.)
 * - URI: Unified resource identification and parsing system
 * - Currency: Financial data handling and conversion utilities
 *
 * These core components provide the foundation for all higher-level functionality
 * including Gmail integration, workflow automation, and AI processing.
 *
 * @module Core
 * @version 1.0.0
 * @author Divizend GmbH
 */

export * from "./Universe";
export * from "./Scratch";
export * from "./Auth";
export * from "./Fragment";
export * from "./FragmentServingMode";
export * from "./URI";
export * from "./Currency";
export * from "./JsonSchemaValidator";
export * from "./Env";
