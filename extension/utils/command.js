(function attachBrewFinderCommand(root) {
  function isHomebrewCask(match) {
    return Boolean(match && (match.tap === 'homebrew/cask' || match.type === 'cask'));
  }

  function installCommandFor(match) {
    const token = (match && (match.token || match.name)) || '';
    const caskFlag = isHomebrewCask(match) ? ' --cask' : '';
    return `brew install${caskFlag} ${token}`;
  }

  root.BrewFinderCommand = {
    installCommandFor,
    isHomebrewCask,
  };
})(globalThis);
