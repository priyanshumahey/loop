'use client';

import * as React from 'react';

import type { PlateElementProps } from 'platejs/react';
import type { CSSProperties } from 'react';

import { PlateElement } from 'platejs/react';

import { BlockLineNumber } from '@/components/editor/ui/line-numbers';
import { cn } from '@/lib/utils';

export function ParagraphElement(props: PlateElementProps) {
  const align = (props.element as { align?: CSSProperties['textAlign'] }).align;

  return (
    <PlateElement
      {...props}
      className={cn('relative m-0 px-0 py-1')}
      style={{ ...props.style, textAlign: align }}
    >
      <BlockLineNumber />
      {props.children}
    </PlateElement>
  );
}
