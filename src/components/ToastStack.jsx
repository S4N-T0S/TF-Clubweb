import Toast from './Toast';

// Fixed positioning per screen corner. Each corner is a flex column so toasts stack
// instead of overlapping at the same coordinates. The alignment keeps cards hugging
// their edge (right corners align-end, left align-start, center centered).
const POSITION_CLASSES = {
  'top-right': 'top-2 right-2 sm:top-4 sm:right-4 items-end',
  'top-left': 'top-2 left-2 sm:top-4 sm:left-4 items-start',
  'bottom-right': 'bottom-2 right-2 sm:bottom-4 sm:right-4 items-end',
  'bottom-left': 'bottom-2 left-2 sm:bottom-4 sm:left-4 items-start',
  'top-center': 'top-2 left-1/2 -translate-x-1/2 items-center',
  'bottom-center': 'bottom-2 left-1/2 -translate-x-1/2 items-center',
};

// Renders the active toasts grouped by position, newest nearest the screen edge.
export const ToastStack = ({ toasts, onDismiss, isMobile }) => {
  if (!toasts?.length) return null;

  const groups = {};
  for (const t of toasts) {
    const pos = t.position || 'top-right';
    (groups[pos] ||= []).push(t);
  }

  // The React key: a keyed (status) slot keeps a stable identity across replaces so it
  // updates in place; transient toasts use their unique id.
  const reactKey = (t) => t.slotKey ?? t.id;

  return (
    <>
      {Object.entries(groups).map(([pos, list]) => {
        const isBottom = pos.startsWith('bottom');
        // toasts arrive oldest-first. For a top corner the first child sits at the top,
        // so reverse to put the newest on top; for a bottom corner keep order so the
        // newest sits at the bottom (nearest the edge).
        const ordered = isBottom ? list : [...list].reverse();
        return (
          <div
            key={pos}
            className={`fixed z-60 flex flex-col gap-2 pointer-events-none ${POSITION_CLASSES[pos] || POSITION_CLASSES['top-right']}`}
          >
            {ordered.map((t) => (
              <Toast key={reactKey(t)} {...t} onDismiss={onDismiss} isMobile={isMobile} />
            ))}
          </div>
        );
      })}
    </>
  );
};

export default ToastStack;
