import { useMemo, useState } from "react";

function normalizeSearchValue(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

export default function ElectorateSearch({
  electorates,
  onSelect,
  onClose,
  autoFocus = false,
  mobile = false,
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const suggestions = useMemo(() => {
    const normalizedQuery = normalizeSearchValue(query.trim());

    return Object.values(electorates ?? {})
      .filter((electorate) => !normalizedQuery
        || normalizeSearchValue(electorate.electorate_name).includes(normalizedQuery))
      .sort((left, right) =>
        left.electorate_name.localeCompare(right.electorate_name, "en-NZ"),
      );
  }, [electorates, query]);

  function selectElectorate(electorate) {
    setQuery(electorate.electorate_name);
    setActiveIndex(-1);
    setSuggestionsOpen(false);
    onSelect(electorate.electorate_number);
  }

  function handleKeyDown(event) {
    if (!suggestions.length) return;

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && activeIndex >= 0) {
      event.preventDefault();
      selectElectorate(suggestions[activeIndex]);
    } else if (event.key === "Escape") {
      setSuggestionsOpen(false);
      onClose?.();
    }
  }

  return (
    <div
      className={`electorate-search${mobile ? " electorate-search--mobile" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setSuggestionsOpen(false);
        }
      }}
    >
      <div className="electorate-search__input-row">
        <svg className="electorate-search__icon" viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="11" cy="11" r="6.5" />
          <path d="m16 16 4 4" />
        </svg>
        <input
          type="search"
          value={query}
          autoFocus={autoFocus}
          placeholder="Search electorates"
          aria-label="Search electorates"
          aria-controls="electorate-search-suggestions"
          aria-expanded={suggestionsOpen && suggestions.length > 0}
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(-1);
            setSuggestionsOpen(true);
          }}
          onFocus={() => setSuggestionsOpen(true)}
          onKeyDown={handleKeyDown}
        />
        {onClose && (
          <button
            type="button"
            className="electorate-search__close"
            onClick={onClose}
            aria-label="Close electorate search"
          >
            ×
          </button>
        )}
      </div>
      {suggestionsOpen && (
        <div
          id="electorate-search-suggestions"
          className="electorate-search__suggestions"
          role="listbox"
        >
          {suggestions.length ? suggestions.map((electorate, index) => (
            <button
              key={electorate.electorate_number}
              type="button"
              role="option"
              aria-selected={index === activeIndex}
              className={`electorate-search__suggestion${index === activeIndex ? " is-active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => selectElectorate(electorate)}
            >
              {electorate.electorate_name}
            </button>
          )) : (
            <p className="electorate-search__empty">No matching electorates</p>
          )}
        </div>
      )}
    </div>
  );
}
