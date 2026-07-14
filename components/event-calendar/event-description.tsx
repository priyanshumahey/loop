"use client";

import DOMPurify from "isomorphic-dompurify";
import { useMemo } from "react";

import { cn } from "@/lib/utils";

// Force all links to open safely in a new tab (prevents reverse tabnabbing).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
    }
});

interface EventDescriptionProps {
    html: string;
    className?: string;
}

/**
 * Strips HTML markup down to readable plain text. Useful for compact spaces
 * (e.g. event chips) where rich markup would break the layout.
 */
export function stripHtml(html: string): string {
    const text = DOMPurify.sanitize(html, { ALLOWED_TAGS: [], ALLOWED_ATTR: [] });
    return text.replace(/\s+/g, " ").trim();
}

/**
 * Converts an HTML description (e.g. from Google Calendar) into readable
 * multi-line plain text suitable for a plain <textarea>. Preserves line
 * breaks, turns list items into bullets, and keeps link URLs inline so the
 * user editing the field sees text instead of raw `<ul><li>…` markup.
 */
export function htmlToText(html: string): string {
    if (!html) return "";
    // Fast path: nothing that needs converting.
    if (!/[<&]/.test(html)) return html;

    let s = html;
    // Preserve link targets: <a href="url">text</a> -> "text (url)".
    s = s.replace(
        /<a\b[^>]*?href=["']([^"']*)["'][^>]*>([\s\S]*?)<\/a>/gi,
        (_m, href: string, text: string) => {
            const label = text.replace(/<[^>]+>/g, "").trim();
            if (!href || href === label) return label;
            return label ? `${label} (${href})` : href;
        },
    );
    // Explicit line breaks and list items.
    s = s.replace(/<br\s*\/?>/gi, "\n");
    s = s.replace(/<li[^>]*>/gi, "\n• ");
    // Block-level closers become newlines.
    s = s.replace(/<\/(p|div|ul|ol|li|h[1-6]|blockquote|tr)>/gi, "\n");
    // Drop any remaining tags.
    s = s.replace(/<[^>]+>/g, "");
    // Decode the handful of entities Google emits.
    s = s
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#0?39;|&apos;/gi, "'");
    // Tidy whitespace: strip trailing spaces, collapse blank-line runs.
    s = s
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ");
    return s.trim();
}

/**
 * EventDescription - Renders an event's (potentially HTML) description safely.
 *
 * Calendar providers such as Google Calendar store rich descriptions as HTML
 * (lists, links, formatting). We sanitize the markup to prevent XSS and render
 * it with sensible typography.
 */
export function EventDescription({ html, className }: EventDescriptionProps) {
    const sanitized = useMemo(
        () =>
            DOMPurify.sanitize(html, {
                ALLOWED_TAGS: [
                    "a",
                    "b",
                    "strong",
                    "i",
                    "em",
                    "u",
                    "s",
                    "p",
                    "br",
                    "ul",
                    "ol",
                    "li",
                    "span",
                    "div",
                    "blockquote",
                    "code",
                    "pre",
                    "h1",
                    "h2",
                    "h3",
                    "h4",
                ],
                ALLOWED_ATTR: ["href", "target", "rel"],
                ALLOW_DATA_ATTR: false,
            }),
        [html],
    );

    return (
        <div
            className={cn(
                "prose-sm space-y-1 [&_a]:text-primary [&_a]:underline [&_a]:underline-offset-2 [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:my-0.5",
                className,
            )}
            // Content is sanitized with DOMPurify above.
            dangerouslySetInnerHTML={{ __html: sanitized }}
        />
    );
}
