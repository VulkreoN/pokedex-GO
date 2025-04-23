// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for English (`en`).
class AppLocalizationsEn extends AppLocalizations {
  AppLocalizationsEn([String locale = 'en']) : super(locale);

  @override
  String get appTitle => 'PoGo Companion';

  @override
  String get pokedexTab => 'Pokédex';

  @override
  String get myListsTab => 'My Lists';

  @override
  String get gameInfoTab => 'Game Info';

  @override
  String get settingsTab => 'Settings';

  @override
  String get searchHint => 'Search Pokémon (Name or #)';

  @override
  String get statsLabel => 'Stats';

  @override
  String get attackLabel => 'Attack';

  @override
  String get defenseLabel => 'Defense';

  @override
  String get staminaLabel => 'Stamina';

  @override
  String get typesLabel => 'Types';

  @override
  String get formsLabel => 'Forms / Costumes';

  @override
  String get megaEvolutionsLabel => 'Mega Evolutions';

  @override
  String get shinyAvailable => 'Shiny Available';

  @override
  String get shinyUnavailable => 'Shiny Not Available';

  @override
  String get megaAvailable => 'Mega Evolution Available';

  @override
  String get megaUnavailable => 'Mega Evolution Not Available';

  @override
  String get addToList => 'Add to List';

  @override
  String get createListTitle => 'Create New List';

  @override
  String get listNameHint => 'List Name';

  @override
  String get listDescriptionHint => 'Description (Optional)';

  @override
  String get createButton => 'Create';

  @override
  String get cancelButton => 'Cancel';

  @override
  String get deleteListTitle => 'Delete List';

  @override
  String deleteListContent(String listName) {
    return 'Are you sure you want to delete the list \"$listName\"?';
  }

  @override
  String get deleteButton => 'Delete';

  @override
  String get importList => 'Import List';

  @override
  String get exportList => 'Export List';

  @override
  String listDetailsTitle(String listName) {
    return '$listName';
  }

  @override
  String get collectedLabel => 'Collected';

  @override
  String get maleLabel => 'Male';

  @override
  String get femaleLabel => 'Female';

  @override
  String get normalLabel => 'Normal';

  @override
  String get shinyTargetLabel => 'Shiny';

  @override
  String get megaTargetLabel => 'Mega';

  @override
  String get removeEntry => 'Remove';

  @override
  String get copyIds => 'Copy IDs';

  @override
  String get idsCopied => 'Pokémon IDs copied to clipboard!';

  @override
  String get questsTab => 'Quests';

  @override
  String get raidsTab => 'Raids';

  @override
  String get refreshButton => 'Refresh';

  @override
  String get loading => 'Loading...';

  @override
  String error(String message) {
    return 'An error occurred: $message';
  }

  @override
  String get noResults => 'No Pokémon found.';

  @override
  String get noLists => 'You haven\'t created any lists yet. Tap \'+\' to create one!';

  @override
  String get noEntries => 'This list is empty. Add Pokémon from the Pokédex.';

  @override
  String get noQuests => 'No current quests data available. Try refreshing.';

  @override
  String get noRaids => 'No current raid data available. Try refreshing.';

  @override
  String get selectList => 'Select List';

  @override
  String addSelectedTo(int count) {
    return 'Add $count Pokémon to:';
  }

  @override
  String get selectPokemonFirst => 'Long-press to select Pokémon first.';

  @override
  String listImported(String listName) {
    return 'List \"$listName\" imported successfully!';
  }

  @override
  String get listImportError => 'Failed to import list. Invalid file format or read error.';

  @override
  String listExported(String listName) {
    return 'List \"$listName\" exported.';
  }

  @override
  String get listExportError => 'Failed to export list.';

  @override
  String get languageSetting => 'Language';

  @override
  String get english => 'English';

  @override
  String get french => 'French';

  @override
  String get unknownPokemon => 'Unknown Pokémon';

  @override
  String get unknownType => 'Unknown Type';

  @override
  String get unknownQuest => 'Unknown Quest';

  @override
  String get unknownReward => 'Unknown Reward';

  @override
  String get unknownError => 'An unknown error occurred';

  @override
  String get clearSelection => 'Clear Selection';

  @override
  String numSelected(int count) {
    return '$count Selected';
  }

  @override
  String get addEntryToList => 'Add Entry to List';

  @override
  String get targetShiny => 'Target Shiny?';

  @override
  String get targetMega => 'Target Mega?';

  @override
  String get notesLabel => 'Notes';

  @override
  String get saveButton => 'Save';

  @override
  String get editEntry => 'Edit Entry';

  @override
  String get addPokemon => 'Add Pokémon';

  @override
  String get pokemonAlreadyInList => 'This Pokémon variation is already in the list.';

  @override
  String get confirmRemoveTitle => 'Remove Entry?';

  @override
  String get confirmRemoveContent => 'Are you sure you want to remove this entry from the list?';
}
