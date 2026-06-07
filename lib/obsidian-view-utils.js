function isMarkdownView(view) {
  return Boolean(view && view.editor && view.file);
}

function selectMarkdownView({ activeView, markdownLeaves = [] } = {}) {
  if (isMarkdownView(activeView)) {
    return activeView;
  }
  const leaf = markdownLeaves.find((candidate) => isMarkdownView(candidate && candidate.view));
  return leaf ? leaf.view : null;
}

module.exports = {
  isMarkdownView,
  selectMarkdownView,
};
