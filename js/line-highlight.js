// Process [!code highlight] comments in code blocks
(function() {
  function processHighlights() {
    document.querySelectorAll('pre code').forEach(function(code) {
      if (code.getAttribute('data-processed')) return;
      code.setAttribute('data-processed', 'true');
      
      const lines = code.textContent.split('\n');
      const htmlLines = code.innerHTML.split('\n');
      
      const newHtml = htmlLines.map((htmlLine, index) => {
        const textLine = lines[index];
        if (textLine && textLine.includes('// [!code highlight]')) {
          // Remove the comment from display
          const cleaned = htmlLine.replace(/\/\/ \[!code highlight\].*?(<\/span>)?/, '$1');
          return '<span class="highlight-line">' + cleaned + '</span>';
        }
        return htmlLine;
      }).join('\n');
      
      code.innerHTML = newHtml;
    });
  }
  
  // Wait for Prism
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() {
      setTimeout(processHighlights, 150);
    });
  } else {
    setTimeout(processHighlights, 150);
  }
})();
