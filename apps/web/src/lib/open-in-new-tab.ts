// Opens a file's short-lived link in a tab of its own: the tab opens at the tap, so the browser lets it through, and
// the link, asked for after, arrives a moment later. A failure closes the tab again and is thrown for the caller to say.
export async function openInNewTab(link: () => Promise<{ url: string }>): Promise<void> {
  const tab = window.open("", "_blank");
  try {
    const { url } = await link();
    if (tab === null) window.location.assign(url);
    else tab.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}
