import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditIcon } from '../icons/ActionIcons';
import './MoreActionMenu.css';

const MoreIcon = () => (
  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="2" />
    <circle cx="12" cy="12" r="2" />
    <circle cx="19" cy="12" r="2" />
  </svg>
);

const TrashIcon = () => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v5" />
    <path d="M14 11v5" />
  </svg>
);

const MoreActionMenu = ({
  align = 'left',
  className = '',
  isOpen,
  onClose,
  onDelete,
  onEdit,
  onToggle,
  showDelete = true
}) => {
  const buttonRef = useRef(null);
  const menuRef = useRef(null);
  const [menuPosition, setMenuPosition] = useState({ left: 0, top: 0 });

  useEffect(() => {
    if (!isOpen) return undefined;

    const updatePosition = () => {
      const rect = buttonRef.current?.getBoundingClientRect();
      if (!rect) return;

      const menuWidth = 112;
      const left = align === 'right'
        ? Math.max(8, rect.right - menuWidth)
        : Math.min(rect.left, window.innerWidth - menuWidth - 8);

      setMenuPosition({
        left,
        top: Math.min(rect.bottom + 6, window.innerHeight - 82)
      });
    };

    updatePosition();
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);

    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
    };
  }, [align, isOpen]);

  useEffect(() => {
    if (!isOpen) return undefined;

    const handlePointerDown = (event) => {
      if (
        buttonRef.current?.contains(event.target) ||
        menuRef.current?.contains(event.target)
      ) {
        return;
      }
      onClose();
    };

    document.addEventListener('pointerdown', handlePointerDown);
    return () => document.removeEventListener('pointerdown', handlePointerDown);
  }, [isOpen, onClose]);

  const classes = ['more-action', className].filter(Boolean).join(' ');

  return (
    <div className={classes}>
      <button
        ref={buttonRef}
        type="button"
        className="more-action-button"
        onClick={onToggle}
        title="更多操作"
        aria-label="更多操作"
        aria-expanded={isOpen}
      >
        <MoreIcon />
      </button>
      {isOpen && createPortal(
        <div
          ref={menuRef}
          className="more-action-menu"
          role="menu"
          style={{ left: `${menuPosition.left}px`, top: `${menuPosition.top}px` }}
        >
          <button type="button" className="more-action-item" role="menuitem" onClick={onEdit}>
            <EditIcon />
            <span>编辑</span>
          </button>
          {showDelete && (
            <button type="button" className="more-action-item danger" role="menuitem" onClick={onDelete}>
              <TrashIcon />
              <span>删除</span>
            </button>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

export default MoreActionMenu;
