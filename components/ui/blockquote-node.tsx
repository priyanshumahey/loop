'use client';

import { type PlateElementProps, PlateElement } from 'platejs/react';
import type { CSSProperties } from 'react';

import { BlockLineNumber } from '@/components/editor/ui/line-numbers';

export function BlockquoteElement(props: PlateElementProps) {
  const align = (props.element as { align?: CSSProperties['textAlign'] }).align;

  return (
    <PlateElement
      as="blockquote"
      className="relative my-2 border-l-2 border-line-strong pl-5 italic text-ink-2"
      style={{ ...props.style, textAlign: align }}
      {...props}
    >
      <BlockLineNumber />
      {props.children}
    </PlateElement>
  );
}
