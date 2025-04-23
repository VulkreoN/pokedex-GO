import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mydexpogo/l10n/app_localizations.dart'; // Corrected import (using generated file)
import 'package:mydexpogo/providers/app_providers.dart'; // Corrected import
import 'package:mydexpogo/utils/localization_helper.dart'; // Corrected import


class SettingsScreen extends ConsumerWidget {
  const SettingsScreen({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final l10n = context.l10n;
    final currentLocale = ref.watch(localeProvider);

    return Scaffold(
      appBar: AppBar(
        title: Text(l10n.settingsTab),
      ),
      body: ListView(
        children: [
          ListTile(
            title: Text(l10n.languageSetting),
            trailing: DropdownButton<Locale>(
              value: currentLocale,
              onChanged: (Locale? newLocale) {
                if (newLocale != null) {
                  ref.read(localeProvider.notifier).state = newLocale;
                  // TODO: Persist the selected locale using SharedPreferences or Hive
                }
              },
              items: AppLocalizations.supportedLocales.map<DropdownMenuItem<Locale>>((Locale locale) {
                String langName = locale.languageCode == 'fr' ? l10n.french : l10n.english;
                return DropdownMenuItem<Locale>(
                  value: locale,
                  child: Text(langName),
                );
              }).toList(),
            ),
          ),
          // Add other settings here (Theme, Data Refresh Rate, etc.)
        ],
      ),
    );
  }
}