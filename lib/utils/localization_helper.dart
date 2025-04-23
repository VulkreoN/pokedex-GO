import 'package:flutter/widgets.dart';
import 'package:mydexpogo/l10n/app_localizations.dart'; // Corrected import (using generated file)


// Extension method to easily access localizations
extension LocalizationHelper on BuildContext {
  AppLocalizations get l10n => AppLocalizations.of(this)!;
}
