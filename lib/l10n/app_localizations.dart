import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter/widgets.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:intl/intl.dart' as intl;

import 'app_localizations_en.dart';
import 'app_localizations_fr.dart';

// ignore_for_file: type=lint

/// Callers can lookup localized strings with an instance of AppLocalizations
/// returned by `AppLocalizations.of(context)`.
///
/// Applications need to include `AppLocalizations.delegate()` in their app's
/// `localizationDelegates` list, and the locales they support in the app's
/// `supportedLocales` list. For example:
///
/// ```dart
/// import 'l10n/app_localizations.dart';
///
/// return MaterialApp(
///   localizationsDelegates: AppLocalizations.localizationsDelegates,
///   supportedLocales: AppLocalizations.supportedLocales,
///   home: MyApplicationHome(),
/// );
/// ```
///
/// ## Update pubspec.yaml
///
/// Please make sure to update your pubspec.yaml to include the following
/// packages:
///
/// ```yaml
/// dependencies:
///   # Internationalization support.
///   flutter_localizations:
///     sdk: flutter
///   intl: any # Use the pinned version from flutter_localizations
///
///   # Rest of dependencies
/// ```
///
/// ## iOS Applications
///
/// iOS applications define key application metadata, including supported
/// locales, in an Info.plist file that is built into the application bundle.
/// To configure the locales supported by your app, you’ll need to edit this
/// file.
///
/// First, open your project’s ios/Runner.xcworkspace Xcode workspace file.
/// Then, in the Project Navigator, open the Info.plist file under the Runner
/// project’s Runner folder.
///
/// Next, select the Information Property List item, select Add Item from the
/// Editor menu, then select Localizations from the pop-up menu.
///
/// Select and expand the newly-created Localizations item then, for each
/// locale your application supports, add a new item and select the locale
/// you wish to add from the pop-up menu in the Value field. This list should
/// be consistent with the languages listed in the AppLocalizations.supportedLocales
/// property.
abstract class AppLocalizations {
  AppLocalizations(String locale) : localeName = intl.Intl.canonicalizedLocale(locale.toString());

  final String localeName;

  static AppLocalizations? of(BuildContext context) {
    return Localizations.of<AppLocalizations>(context, AppLocalizations);
  }

  static const LocalizationsDelegate<AppLocalizations> delegate = _AppLocalizationsDelegate();

  /// A list of this localizations delegate along with the default localizations
  /// delegates.
  ///
  /// Returns a list of localizations delegates containing this delegate along with
  /// GlobalMaterialLocalizations.delegate, GlobalCupertinoLocalizations.delegate,
  /// and GlobalWidgetsLocalizations.delegate.
  ///
  /// Additional delegates can be added by appending to this list in
  /// MaterialApp. This list does not have to be used at all if a custom list
  /// of delegates is preferred or required.
  static const List<LocalizationsDelegate<dynamic>> localizationsDelegates = <LocalizationsDelegate<dynamic>>[
    delegate,
    GlobalMaterialLocalizations.delegate,
    GlobalCupertinoLocalizations.delegate,
    GlobalWidgetsLocalizations.delegate,
  ];

  /// A list of this localizations delegate's supported locales.
  static const List<Locale> supportedLocales = <Locale>[
    Locale('en'),
    Locale('fr')
  ];

  /// No description provided for @appTitle.
  ///
  /// In en, this message translates to:
  /// **'PoGo Companion'**
  String get appTitle;

  /// No description provided for @pokedexTab.
  ///
  /// In en, this message translates to:
  /// **'Pokédex'**
  String get pokedexTab;

  /// No description provided for @myListsTab.
  ///
  /// In en, this message translates to:
  /// **'My Lists'**
  String get myListsTab;

  /// No description provided for @gameInfoTab.
  ///
  /// In en, this message translates to:
  /// **'Game Info'**
  String get gameInfoTab;

  /// No description provided for @settingsTab.
  ///
  /// In en, this message translates to:
  /// **'Settings'**
  String get settingsTab;

  /// No description provided for @searchHint.
  ///
  /// In en, this message translates to:
  /// **'Search Pokémon (Name or #)'**
  String get searchHint;

  /// No description provided for @statsLabel.
  ///
  /// In en, this message translates to:
  /// **'Stats'**
  String get statsLabel;

  /// No description provided for @attackLabel.
  ///
  /// In en, this message translates to:
  /// **'Attack'**
  String get attackLabel;

  /// No description provided for @defenseLabel.
  ///
  /// In en, this message translates to:
  /// **'Defense'**
  String get defenseLabel;

  /// No description provided for @staminaLabel.
  ///
  /// In en, this message translates to:
  /// **'Stamina'**
  String get staminaLabel;

  /// No description provided for @typesLabel.
  ///
  /// In en, this message translates to:
  /// **'Types'**
  String get typesLabel;

  /// No description provided for @formsLabel.
  ///
  /// In en, this message translates to:
  /// **'Forms / Costumes'**
  String get formsLabel;

  /// No description provided for @megaEvolutionsLabel.
  ///
  /// In en, this message translates to:
  /// **'Mega Evolutions'**
  String get megaEvolutionsLabel;

  /// No description provided for @shinyAvailable.
  ///
  /// In en, this message translates to:
  /// **'Shiny Available'**
  String get shinyAvailable;

  /// No description provided for @shinyUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Shiny Not Available'**
  String get shinyUnavailable;

  /// No description provided for @megaAvailable.
  ///
  /// In en, this message translates to:
  /// **'Mega Evolution Available'**
  String get megaAvailable;

  /// No description provided for @megaUnavailable.
  ///
  /// In en, this message translates to:
  /// **'Mega Evolution Not Available'**
  String get megaUnavailable;

  /// No description provided for @addToList.
  ///
  /// In en, this message translates to:
  /// **'Add to List'**
  String get addToList;

  /// No description provided for @createListTitle.
  ///
  /// In en, this message translates to:
  /// **'Create New List'**
  String get createListTitle;

  /// No description provided for @listNameHint.
  ///
  /// In en, this message translates to:
  /// **'List Name'**
  String get listNameHint;

  /// No description provided for @listDescriptionHint.
  ///
  /// In en, this message translates to:
  /// **'Description (Optional)'**
  String get listDescriptionHint;

  /// No description provided for @createButton.
  ///
  /// In en, this message translates to:
  /// **'Create'**
  String get createButton;

  /// No description provided for @cancelButton.
  ///
  /// In en, this message translates to:
  /// **'Cancel'**
  String get cancelButton;

  /// No description provided for @deleteListTitle.
  ///
  /// In en, this message translates to:
  /// **'Delete List'**
  String get deleteListTitle;

  /// No description provided for @deleteListContent.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to delete the list \"{listName}\"?'**
  String deleteListContent(String listName);

  /// No description provided for @deleteButton.
  ///
  /// In en, this message translates to:
  /// **'Delete'**
  String get deleteButton;

  /// No description provided for @importList.
  ///
  /// In en, this message translates to:
  /// **'Import List'**
  String get importList;

  /// No description provided for @exportList.
  ///
  /// In en, this message translates to:
  /// **'Export List'**
  String get exportList;

  /// No description provided for @listDetailsTitle.
  ///
  /// In en, this message translates to:
  /// **'{listName}'**
  String listDetailsTitle(String listName);

  /// No description provided for @collectedLabel.
  ///
  /// In en, this message translates to:
  /// **'Collected'**
  String get collectedLabel;

  /// No description provided for @maleLabel.
  ///
  /// In en, this message translates to:
  /// **'Male'**
  String get maleLabel;

  /// No description provided for @femaleLabel.
  ///
  /// In en, this message translates to:
  /// **'Female'**
  String get femaleLabel;

  /// No description provided for @normalLabel.
  ///
  /// In en, this message translates to:
  /// **'Normal'**
  String get normalLabel;

  /// No description provided for @shinyTargetLabel.
  ///
  /// In en, this message translates to:
  /// **'Shiny'**
  String get shinyTargetLabel;

  /// No description provided for @megaTargetLabel.
  ///
  /// In en, this message translates to:
  /// **'Mega'**
  String get megaTargetLabel;

  /// No description provided for @removeEntry.
  ///
  /// In en, this message translates to:
  /// **'Remove'**
  String get removeEntry;

  /// No description provided for @copyIds.
  ///
  /// In en, this message translates to:
  /// **'Copy IDs'**
  String get copyIds;

  /// No description provided for @idsCopied.
  ///
  /// In en, this message translates to:
  /// **'Pokémon IDs copied to clipboard!'**
  String get idsCopied;

  /// No description provided for @questsTab.
  ///
  /// In en, this message translates to:
  /// **'Quests'**
  String get questsTab;

  /// No description provided for @raidsTab.
  ///
  /// In en, this message translates to:
  /// **'Raids'**
  String get raidsTab;

  /// No description provided for @refreshButton.
  ///
  /// In en, this message translates to:
  /// **'Refresh'**
  String get refreshButton;

  /// No description provided for @loading.
  ///
  /// In en, this message translates to:
  /// **'Loading...'**
  String get loading;

  /// No description provided for @error.
  ///
  /// In en, this message translates to:
  /// **'An error occurred: {message}'**
  String error(String message);

  /// No description provided for @noResults.
  ///
  /// In en, this message translates to:
  /// **'No Pokémon found.'**
  String get noResults;

  /// No description provided for @noLists.
  ///
  /// In en, this message translates to:
  /// **'You haven\'t created any lists yet. Tap \'+\' to create one!'**
  String get noLists;

  /// No description provided for @noEntries.
  ///
  /// In en, this message translates to:
  /// **'This list is empty. Add Pokémon from the Pokédex.'**
  String get noEntries;

  /// No description provided for @noQuests.
  ///
  /// In en, this message translates to:
  /// **'No current quests data available. Try refreshing.'**
  String get noQuests;

  /// No description provided for @noRaids.
  ///
  /// In en, this message translates to:
  /// **'No current raid data available. Try refreshing.'**
  String get noRaids;

  /// No description provided for @selectList.
  ///
  /// In en, this message translates to:
  /// **'Select List'**
  String get selectList;

  /// No description provided for @addSelectedTo.
  ///
  /// In en, this message translates to:
  /// **'Add {count} Pokémon to:'**
  String addSelectedTo(int count);

  /// No description provided for @selectPokemonFirst.
  ///
  /// In en, this message translates to:
  /// **'Long-press to select Pokémon first.'**
  String get selectPokemonFirst;

  /// No description provided for @listImported.
  ///
  /// In en, this message translates to:
  /// **'List \"{listName}\" imported successfully!'**
  String listImported(String listName);

  /// No description provided for @listImportError.
  ///
  /// In en, this message translates to:
  /// **'Failed to import list. Invalid file format or read error.'**
  String get listImportError;

  /// No description provided for @listExported.
  ///
  /// In en, this message translates to:
  /// **'List \"{listName}\" exported.'**
  String listExported(String listName);

  /// No description provided for @listExportError.
  ///
  /// In en, this message translates to:
  /// **'Failed to export list.'**
  String get listExportError;

  /// No description provided for @languageSetting.
  ///
  /// In en, this message translates to:
  /// **'Language'**
  String get languageSetting;

  /// No description provided for @english.
  ///
  /// In en, this message translates to:
  /// **'English'**
  String get english;

  /// No description provided for @french.
  ///
  /// In en, this message translates to:
  /// **'French'**
  String get french;

  /// No description provided for @unknownPokemon.
  ///
  /// In en, this message translates to:
  /// **'Unknown Pokémon'**
  String get unknownPokemon;

  /// No description provided for @unknownType.
  ///
  /// In en, this message translates to:
  /// **'Unknown Type'**
  String get unknownType;

  /// No description provided for @unknownQuest.
  ///
  /// In en, this message translates to:
  /// **'Unknown Quest'**
  String get unknownQuest;

  /// No description provided for @unknownReward.
  ///
  /// In en, this message translates to:
  /// **'Unknown Reward'**
  String get unknownReward;

  /// No description provided for @unknownError.
  ///
  /// In en, this message translates to:
  /// **'An unknown error occurred'**
  String get unknownError;

  /// No description provided for @clearSelection.
  ///
  /// In en, this message translates to:
  /// **'Clear Selection'**
  String get clearSelection;

  /// No description provided for @numSelected.
  ///
  /// In en, this message translates to:
  /// **'{count} Selected'**
  String numSelected(int count);

  /// No description provided for @addEntryToList.
  ///
  /// In en, this message translates to:
  /// **'Add Entry to List'**
  String get addEntryToList;

  /// No description provided for @targetShiny.
  ///
  /// In en, this message translates to:
  /// **'Target Shiny?'**
  String get targetShiny;

  /// No description provided for @targetMega.
  ///
  /// In en, this message translates to:
  /// **'Target Mega?'**
  String get targetMega;

  /// No description provided for @notesLabel.
  ///
  /// In en, this message translates to:
  /// **'Notes'**
  String get notesLabel;

  /// No description provided for @saveButton.
  ///
  /// In en, this message translates to:
  /// **'Save'**
  String get saveButton;

  /// No description provided for @editEntry.
  ///
  /// In en, this message translates to:
  /// **'Edit Entry'**
  String get editEntry;

  /// No description provided for @addPokemon.
  ///
  /// In en, this message translates to:
  /// **'Add Pokémon'**
  String get addPokemon;

  /// No description provided for @pokemonAlreadyInList.
  ///
  /// In en, this message translates to:
  /// **'This Pokémon variation is already in the list.'**
  String get pokemonAlreadyInList;

  /// No description provided for @confirmRemoveTitle.
  ///
  /// In en, this message translates to:
  /// **'Remove Entry?'**
  String get confirmRemoveTitle;

  /// No description provided for @confirmRemoveContent.
  ///
  /// In en, this message translates to:
  /// **'Are you sure you want to remove this entry from the list?'**
  String get confirmRemoveContent;
}

class _AppLocalizationsDelegate extends LocalizationsDelegate<AppLocalizations> {
  const _AppLocalizationsDelegate();

  @override
  Future<AppLocalizations> load(Locale locale) {
    return SynchronousFuture<AppLocalizations>(lookupAppLocalizations(locale));
  }

  @override
  bool isSupported(Locale locale) => <String>['en', 'fr'].contains(locale.languageCode);

  @override
  bool shouldReload(_AppLocalizationsDelegate old) => false;
}

AppLocalizations lookupAppLocalizations(Locale locale) {


  // Lookup logic when only language code is specified.
  switch (locale.languageCode) {
    case 'en': return AppLocalizationsEn();
    case 'fr': return AppLocalizationsFr();
  }

  throw FlutterError(
    'AppLocalizations.delegate failed to load unsupported locale "$locale". This is likely '
    'an issue with the localizations generation tool. Please file an issue '
    'on GitHub with a reproducible sample app and the gen-l10n configuration '
    'that was used.'
  );
}
