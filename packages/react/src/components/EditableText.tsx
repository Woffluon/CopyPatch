import React, { ElementType, ComponentPropsWithoutRef } from 'react';
import { useEditableText } from '../hooks/useEditableText.js';

export type EditableTextProps<T extends ElementType = 'span'> = {
  contentKey: string;
  as?: T;
  allowLineBreaks?: boolean;
  children: string;
} & Omit<ComponentPropsWithoutRef<T>, 'children' | 'as'>;

export function EditableText<T extends ElementType = 'span'>({
  contentKey,
  as,
  allowLineBreaks = false,
  children,
  className,
  style,
  ...restProps
}: EditableTextProps<T>) {
  const Component = (as || 'span') as ElementType;
  const fallback = typeof children === 'string' ? children : String(children ?? '');

  const editable = useEditableText(contentKey, fallback, { allowLineBreaks });

  // Normal visitor mode: pure React children string interpolation
  if (!editable.isEditorActive) {
    return (
      <Component
        data-copypatch={contentKey}
        className={className}
        style={style}
        {...restProps}
      >
        {editable.text}
      </Component>
    );
  }

  // Prevent parent <a>, <button> default clicks while editing
  const handleClick = (e: React.MouseEvent) => {
    if (editable.isEditorActive) {
      e.stopPropagation();
    }
  };

  // Editor mode: uncontrolled contentEditable DOM surface so React VDOM re-renders
  // never touch or collapse native browser selection/caret while typing!
  return (
    <Component
      ref={editable.elementRef}
      className={className}
      style={{
        ...style,
        outline: editable.isEditing
          ? '2px solid #2563eb'
          : '1px dashed rgba(59, 130, 246, 0.4)',
        outlineOffset: '2px',
        cursor: 'text',
        borderRadius: '2px',
      }}
      contentEditable={editable.contentEditable}
      suppressContentEditableWarning={editable.suppressContentEditableWarning}
      data-copypatch={contentKey}
      onFocus={editable.onFocus}
      onBlur={editable.onBlur}
      onInput={editable.onInput}
      onCompositionStart={editable.onCompositionStart}
      onCompositionEnd={editable.onCompositionEnd}
      onKeyDown={editable.onKeyDown}
      onPaste={editable.onPaste}
      onClick={handleClick}
      {...restProps}
    />
  );
}
