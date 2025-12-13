/**
 * Gmail Utility Functions
 *
 * This module provides utility functions for Gmail operations including:
 * - Content encoding and decoding (quoted-printable, base64)
 * - HTML processing and sanitization
 * - URL rewriting for embedded content
 * - MIME message formatting and composition
 *
 * These utilities handle the low-level details of email processing,
 * content transformation, and message composition that are common
 * across different Gmail operations.
 *
 * @module GmailUtils
 * @version 1.0.0
 * @author Divizend GmbH
 */

/**
 * Decodes quoted-printable encoded content
 *
 * Quoted-printable is a content transfer encoding used in email
 * that represents 8-bit data using only 7-bit printable ASCII characters.
 * This function handles both soft line breaks and hex-encoded bytes.
 *
 * @param buf - Buffer containing quoted-printable encoded data
 * @returns Buffer with decoded content
 */
export function qpDecode(buf: Buffer): Buffer {
  // Convert to string for ease; handle soft line breaks and =XX hex
  let s = buf.toString("utf8");
  // remove soft line breaks
  s = s.replace(/=\r?\n/g, "");
  // replace =HH hex bytes
  s = s.replace(/=([A-Fa-f0-9]{2})/g, (_, hex) =>
    String.fromCharCode(parseInt(hex, 16))
  );
  return Buffer.from(s, "utf8");
}

/**
 * Escapes special regex characters in a string
 *
 * This function escapes characters that have special meaning in regular
 * expressions, allowing the string to be used safely in regex patterns.
 *
 * @param s - String to escape
 * @returns String with regex special characters escaped
 */
export function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Rewrites CID URLs in HTML/CSS to fragment URIs
 *
 * Content-ID (CID) URLs are used in multipart emails to reference
 * embedded content like images. This function converts them to
 * fragment URIs that can be served by the system.
 *
 * @param html - HTML content containing CID URLs
 * @param uri - Base URI for the message
 * @param cidToPart - Mapping of CID values to part IDs
 * @returns HTML with CID URLs rewritten to fragment URIs
 */
export function rewriteCidUrls(
  html: string,
  uri: string,
  cidToPart: { [key: string]: string }
): string {
  // To avoid partial overlaps, replace longest CIDs first
  const keys = Object.keys(cidToPart).sort((a, b) => b.length - a.length);
  for (const cid of keys) {
    const partId = cidToPart[cid];
    const url = `/fragment?uri=${encodeURIComponent(uri + "/part/" + partId)}`;
    const pat = new RegExp(
      `cid:(?:%3C|<)?${escapeRegExp(cid)}(?:%3E|>)?`,
      "gi"
    );
    html = html.replace(pat, url);
  }
  return html;
}

/**
 * Converts a buffer or string to base64url encoding
 *
 * Base64url is a URL-safe variant of base64 encoding that replaces
 * '+' with '-' and '/' with '_', and removes padding characters.
 * This is commonly used in JWT tokens and other web-safe encodings.
 *
 * @param buf - Buffer or string to encode
 * @returns Base64url encoded string
 */
export function base64Url(buf: Buffer | string) {
  return (typeof buf === "string" ? Buffer.from(buf, "utf8") : buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

/**
 * Chunks a string into 76-character lines
 *
 * This function breaks long strings into lines of 76 characters
 * or less, which is the standard line length for MIME messages.
 * Each line is terminated with CRLF (\r\n).
 *
 * @param s - String to chunk
 * @returns String with line breaks every 76 characters
 */
export function chunk76(s: string) {
  return s.replace(/.{1,76}/g, "$&\r\n");
}

/**
 * Escapes HTML special characters
 *
 * Converts HTML special characters to their entity equivalents
 * to prevent HTML injection and ensure safe content display.
 *
 * @param s - String containing HTML content
 * @returns String with HTML special characters escaped
 */
export function escapeHtml(s: string) {
  return s.replace(
    /[&<>"']/g,
    (c) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      }[c]!)
  );
}

/**
 * Converts plain text to HTML with line breaks
 *
 * This function wraps plain text in HTML div tags and converts
 * line breaks to HTML br tags for proper display in web browsers.
 *
 * @param s - Plain text string
 * @returns HTML string with line breaks converted to br tags
 */
export function htmlFromText(s: string) {
  return `<div>${escapeHtml(s).replace(/\r?\n/g, "<br>")}</div>`;
}

/**
 * Strips HTML tags to extract plain text
 *
 * Removes all HTML tags and converts common HTML elements like
 * br and p tags to appropriate line breaks for plain text output.
 *
 * @param html - HTML string to convert
 * @returns Plain text with HTML tags removed
 */
export function stripHtmlToText(html: string) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

/**
 * Encodes display names for email headers
 *
 * This function handles display names in email headers, particularly
 * for international characters. It uses base64 encoding for non-ASCII
 * names and proper quoting for ASCII names.
 *
 * @param name - Display name to encode
 * @returns Properly encoded display name for email headers
 */
export function encodeDisplayName(name: string) {
  return /[^\x00-\x7F]/.test(name)
    ? `=?UTF-8?B?${Buffer.from(name, "utf8").toString("base64")}?=`
    : `"${name.replace(/"/g, '\\"')}"`;
}
