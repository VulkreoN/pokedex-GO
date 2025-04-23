// ignore: unused_import
import 'package:intl/intl.dart' as intl;
import 'app_localizations.dart';

// ignore_for_file: type=lint

/// The translations for French (`fr`).
class AppLocalizationsFr extends AppLocalizations {
  AppLocalizationsFr([String locale = 'fr']) : super(locale);

  @override
  String get appTitle => 'Compagnon PoGo';

  @override
  String get pokedexTab => 'Pokédex';

  @override
  String get myListsTab => 'Mes Listes';

  @override
  String get gameInfoTab => 'Infos Jeu';

  @override
  String get settingsTab => 'Paramètres';

  @override
  String get searchHint => 'Chercher Pokémon (Nom ou #)';

  @override
  String get statsLabel => 'Stats';

  @override
  String get attackLabel => 'Attaque';

  @override
  String get defenseLabel => 'Défense';

  @override
  String get staminaLabel => 'Endurance';

  @override
  String get typesLabel => 'Types';

  @override
  String get formsLabel => 'Formes / Costumes';

  @override
  String get megaEvolutionsLabel => 'Méga-Évolutions';

  @override
  String get shinyAvailable => 'Shiny Disponible';

  @override
  String get shinyUnavailable => 'Shiny Non Disponible';

  @override
  String get megaAvailable => 'Méga-Évolution Disponible';

  @override
  String get megaUnavailable => 'Méga-Évolution Non Disponible';

  @override
  String get addToList => 'Ajouter à la liste';

  @override
  String get createListTitle => 'Créer une nouvelle liste';

  @override
  String get listNameHint => 'Nom de la liste';

  @override
  String get listDescriptionHint => 'Description (Optionnel)';

  @override
  String get createButton => 'Créer';

  @override
  String get cancelButton => 'Annuler';

  @override
  String get deleteListTitle => 'Supprimer la liste';

  @override
  String deleteListContent(String listName) {
    return 'Êtes-vous sûr de vouloir supprimer la liste \"$listName\" ?';
  }

  @override
  String get deleteButton => 'Supprimer';

  @override
  String get importList => 'Importer une liste';

  @override
  String get exportList => 'Exporter la liste';

  @override
  String listDetailsTitle(String listName) {
    return '$listName';
  }

  @override
  String get collectedLabel => 'Collectionné';

  @override
  String get maleLabel => 'Mâle';

  @override
  String get femaleLabel => 'Femelle';

  @override
  String get normalLabel => 'Normal';

  @override
  String get shinyTargetLabel => 'Shiny';

  @override
  String get megaTargetLabel => 'Méga';

  @override
  String get removeEntry => 'Retirer';

  @override
  String get copyIds => 'Copier IDs';

  @override
  String get idsCopied => 'IDs Pokémon copiés dans le presse-papiers !';

  @override
  String get questsTab => 'Quêtes';

  @override
  String get raidsTab => 'Raids';

  @override
  String get refreshButton => 'Rafraîchir';

  @override
  String get loading => 'Chargement...';

  @override
  String error(String message) {
    return 'Une erreur est survenue : $message';
  }

  @override
  String get noResults => 'Aucun Pokémon trouvé.';

  @override
  String get noLists => 'Vous n\'avez pas encore créé de listes. Appuyez sur \'+\' pour en créer une !';

  @override
  String get noEntries => 'Cette liste est vide. Ajoutez des Pokémon depuis le Pokédex.';

  @override
  String get noQuests => 'Aucune donnée de quête actuelle disponible. Essayez de rafraîchir.';

  @override
  String get noRaids => 'Aucune donnée de raid actuelle disponible. Essayez de rafraîchir.';

  @override
  String get selectList => 'Sélectionner une liste';

  @override
  String addSelectedTo(int count) {
    return 'Ajouter $count Pokémon à :';
  }

  @override
  String get selectPokemonFirst => 'Appuyez longuement pour sélectionner des Pokémon d\'abord.';

  @override
  String listImported(String listName) {
    return 'Liste \"$listName\" importée avec succès !';
  }

  @override
  String get listImportError => 'Échec de l\'importation de la liste. Format de fichier invalide ou erreur de lecture.';

  @override
  String listExported(String listName) {
    return 'Liste \"$listName\" exportée.';
  }

  @override
  String get listExportError => 'Échec de l\'exportation de la liste.';

  @override
  String get languageSetting => 'Langue';

  @override
  String get english => 'Anglais';

  @override
  String get french => 'Français';

  @override
  String get unknownPokemon => 'Pokémon inconnu';

  @override
  String get unknownType => 'Type inconnu';

  @override
  String get unknownQuest => 'Quête inconnue';

  @override
  String get unknownReward => 'Récompense inconnue';

  @override
  String get unknownError => 'Une erreur inconnue est survenue';

  @override
  String get clearSelection => 'Désélectionner';

  @override
  String numSelected(int count) {
    return '$count Sélectionnés';
  }

  @override
  String get addEntryToList => 'Ajouter une entrée à la liste';

  @override
  String get targetShiny => 'Cibler Shiny ?';

  @override
  String get targetMega => 'Cibler Méga ?';

  @override
  String get notesLabel => 'Notes';

  @override
  String get saveButton => 'Sauvegarder';

  @override
  String get editEntry => 'Modifier l\'entrée';

  @override
  String get addPokemon => 'Ajouter Pokémon';

  @override
  String get pokemonAlreadyInList => 'Cette variation de Pokémon est déjà dans la liste.';

  @override
  String get confirmRemoveTitle => 'Supprimer l\'entrée ?';

  @override
  String get confirmRemoveContent => 'Êtes-vous sûr de vouloir supprimer cette entrée de la liste ?';
}
