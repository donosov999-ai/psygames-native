/// Tatham deliberately reports status 0 for some reversible dead ends. The
/// English status strings are engine protocol, not localized UI. Keep the
/// recovery affordance separate from competitive win/fail accounting.
bool puzzleNeedsRecovery(String engineName, int status, String statusText) {
  if (status != 0) return false;
  return switch (engineName) {
    'Mines' || 'Inertia' => RegExp(r'(?:^|\s)DEAD!(?:\s|$)').hasMatch(statusText),
    'Same Game' => RegExp(r'(?:^|\s)Cannot move!(?:\s|$)').hasMatch(statusText),
    _ => false,
  };
}
