export const Pagination = ({ currentPage, totalPages, onPageChange }) => {
  const pages = [];
  const maxVisible = 5;
  let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
  let endPage = Math.min(totalPages, startPage + maxVisible - 1);
  if (endPage - startPage < maxVisible - 1) {
    startPage = Math.max(1, endPage - maxVisible + 1);
  }

  if (startPage > 1) {
    pages.push(
      <button
        key="first"
        onClick={() => onPageChange(1)}
        className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 transition"
      >
        1
      </button>
    );
    if (startPage > 2) pages.push(<span key="dots1">...</span>);
  }

  for (let i = startPage; i <= endPage; i++) {
    pages.push(
      <button
        key={i}
        onClick={() => onPageChange(i)}
        className={`px-3 py-2 rounded transition ${
          i === currentPage
            ? 'bg-blue-600 text-white border border-blue-600'
            : 'border border-gray-300 hover:bg-gray-50'
        }`}
      >
        {i}
      </button>
    );
  }

  if (endPage < totalPages) {
    if (endPage < totalPages - 1) pages.push(<span key="dots2">...</span>);
    pages.push(
      <button
        key="last"
        onClick={() => onPageChange(totalPages)}
        className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 transition"
      >
        {totalPages}
      </button>
    );
  }

  return (
    <div className="flex justify-center gap-2 mt-6">
      <button
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        Previous
      </button>
      {pages}
      <button
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        className="px-3 py-2 rounded border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition"
      >
        Next
      </button>
    </div>
  );
};

export default Pagination;
