import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:mydexpogo/l10n/app_localizations.dart'; // Corrected import (using generated file)
import 'package:mydexpogo/providers/app_providers.dart'; // Corrected import
import 'package:mydexpogo/ui/screens/home_screen.dart'; // Corrected import

// Consider renaming this class to MyDexPoGoApp to match project name if desired
class PokemonGoCompanionApp extends ConsumerWidget {
  const PokemonGoCompanionApp({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final currentLocale = ref.watch(localeProvider);

    return MaterialApp(
      title: 'MyDexPoGo', // Updated title to match project
      theme: ThemeData(
        primarySwatch: Colors.red, // Pokemon theme!
        visualDensity: VisualDensity.adaptivePlatformDensity,
        useMaterial3: true,
        brightness: Brightness.light,
        // Add more theme customization
      ),
      darkTheme: ThemeData(
        primarySwatch: Colors.red,
        visualDensity: VisualDensity.adaptivePlatformDensity,
        useMaterial3: true,
        brightness: Brightness.dark,
        // Add dark theme specifics
      ),
      themeMode: ThemeMode.system, // Or allow user selection
      // Localization setup
      locale: currentLocale,
      localizationsDelegates: const [
        AppLocalizations.delegate, // Generated delegate
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      supportedLocales: AppLocalizations.supportedLocales, // Generated list [Locale('en'), Locale('fr')]
      home: const HomeScreen(),
      debugShowCheckedModeBanner: false,
    );
  }
}
