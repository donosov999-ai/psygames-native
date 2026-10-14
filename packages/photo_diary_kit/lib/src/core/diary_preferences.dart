/// App consent is separate from OS permission and never inferred from it.
class DiaryPreferences {
  const DiaryPreferences({
    this.cameraConsent = false,
    this.storageConsent = false,
    this.practices = false,
    this.wakeTasks = false,
    this.rainbowCapture = false,
  });
  final bool cameraConsent,
      storageConsent,
      practices,
      wakeTasks,
      rainbowCapture;
  bool get practiceCapture => cameraConsent && practices;
  bool get wakeCapture => cameraConsent && wakeTasks;
  bool get savePhotos => cameraConsent && storageConsent;

  DiaryPreferences change({
    bool? cameraConsent,
    bool? storageConsent,
    bool? practices,
    bool? wakeTasks,
    bool? rainbowCapture,
  }) {
    final consent = cameraConsent ?? this.cameraConsent;
    return DiaryPreferences(
      cameraConsent: consent,
      storageConsent: consent && (storageConsent ?? this.storageConsent),
      practices: consent && (practices ?? this.practices),
      wakeTasks: consent && (wakeTasks ?? this.wakeTasks),
      rainbowCapture: consent && (rainbowCapture ?? this.rainbowCapture),
    );
  }

  Map<String, dynamic> toJson() => {
    'cameraConsent': cameraConsent,
    'storageConsent': storageConsent,
    'practices': practices,
    'wakeTasks': wakeTasks,
    'rainbowCapture': rainbowCapture,
  };
  static DiaryPreferences fromJson(Map<String, dynamic> json) =>
      const DiaryPreferences().change(
        cameraConsent: json['cameraConsent'] == true,
        storageConsent: json['storageConsent'] == true,
        practices: json['practices'] == true,
        wakeTasks: json['wakeTasks'] == true,
        rainbowCapture: json['rainbowCapture'] == true,
      );
}
