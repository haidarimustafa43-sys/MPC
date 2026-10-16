interface Props {
  items: readonly { id: string; label: string; flagged?: boolean }[];
  selectedId: string;
  onSelect: (id: string) => void;
  label: string;
}

/** Accessible tab list for choosing an item (arrow keys move between tabs). */
export function ItemTabs({ items, selectedId, onSelect, label }: Props) {
  return (
    <div className="tabs" role="tablist" aria-label={label}>
      {items.map((item, index) => (
        <button
          key={item.id}
          role="tab"
          aria-selected={item.id === selectedId}
          tabIndex={item.id === selectedId ? 0 : -1}
          onClick={() => onSelect(item.id)}
          onKeyDown={(event) => {
            if (event.key !== "ArrowRight" && event.key !== "ArrowLeft") return;
            const next = items[(index + (event.key === "ArrowRight" ? 1 : items.length - 1)) % items.length];
            onSelect(next.id);
          }}
        >
          {item.label}
          {item.flagged && <span aria-label="problem"> ⚠</span>}
        </button>
      ))}
    </div>
  );
}
