import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:mydexpogo/app.dart'; // Corrected import
import 'package:mydexpogo/data/models/custom_list.dart'; // Corrected import
import 'package:mydexpogo/data/models/list_entry.dart'; // Corrected import
import 'package:mydexpogo/data/services/list_persistence_service.dart'; // Corrected import

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Initialize Hive
  await Hive.initFlutter();

  // Register Adapters (BEFORE opening boxes)
  Hive.registerAdapter(CustomListAdapter());
  Hive.registerAdapter(ListEntryAdapter());

  // Open Hive boxes
  await Hive.openBox<CustomList>(ListPersistenceService.listBoxName);
  // Consider opening a separate box for settings like language
  // await Hive.openBox('settings');

  runApp(
    const ProviderScope( // Riverpod setup
      child: PokemonGoCompanionApp(), // Keep class name for now
    ),
  );
}