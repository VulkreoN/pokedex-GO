import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:mydexpogo/config/api_config.dart'; // Corrected import
import 'package:mydexpogo/data/models/pokemon.dart'; // Corrected import
import 'package:mydexpogo/data/models/quest.dart'; // Corrected import
import 'package:mydexpogo/data/models/raid_boss.dart'; // Corrected import


class ApiService {
  final http.Client _client;

  // Allow injecting the client for testing
  ApiService({http.Client? client}) : _client = client ?? http.Client();

  Future<List<Pokemon>> fetchPokedex() async {
    try {
      final response = await _client.get(Uri.parse(ApiConfig.pokedexUrl));
      if (response.statusCode == 200) {
        // Decode the body first
        final decodedBody = jsonDecode(utf8.decode(response.bodyBytes));

        // Ensure the decoded body is actually a List
        if (decodedBody is! List) {
          print('Error fetching Pokédex: Expected a List but got ${decodedBody.runtimeType}');
          throw Exception('Unexpected JSON format: Expected a List');
        }

        final List<Pokemon> pokemonList = [];
        for (var i = 0; i < decodedBody.length; i++) {
          final item = decodedBody[i];
          // Ensure each item in the list is a Map before parsing
          if (item is Map<String, dynamic>) {
            try {
              pokemonList.add(Pokemon.fromJson(item));
            } catch (e, stackTrace) {
              // Log the error and the problematic item index/content
              print('Error parsing Pokémon at index $i: $e');
              print('Problematic JSON item: $item');
              print('Stack trace: $stackTrace');
              // Decide how to handle: skip this item, throw, return partial list?
              // Skipping for now:
              // continue;
              // Or rethrow to show error in UI:
              throw Exception('Failed to parse Pokémon data at index $i: $e');
            }
          } else {
            // Log if an item in the list is not a Map
            print('Error fetching Pokédex: Expected a Map at index $i but got ${item.runtimeType}');
            // Optionally skip or throw
             throw Exception('Unexpected JSON format: Expected a Map at index $i');
          }
        }
        return pokemonList;

      } else {
        throw Exception('Failed to load Pokédex (Status code: ${response.statusCode})');
      }
    } catch (e) {
      // Log error or handle it more gracefully
      print('Error fetching Pokédex: $e');
      rethrow; // Rethrow to allow providers to handle the error state
    }
  }

  Future<Map<String, List<RaidBoss>>> fetchRaidBosses() async {
    try {
      final response = await _client.get(Uri.parse(ApiConfig.raidBossUrl));
      if (response.statusCode == 200) {
        final decodedBody = jsonDecode(utf8.decode(response.bodyBytes));

        if (decodedBody is! Map<String, dynamic>) {
           print('Error fetching Raids: Expected a Map but got ${decodedBody.runtimeType}');
           throw Exception('Unexpected JSON format for Raids: Expected a Map');
        }

        final Map<String, dynamic> data = decodedBody;
        final Map<String, dynamic>? currentList = data['currentList'] as Map<String, dynamic>?; // Ensure cast

        if (currentList == null) {
             print('Error fetching Raids: "currentList" key not found or is not a Map');
             throw Exception('Unexpected JSON format for Raids: Missing "currentList"');
        }

        final Map<String, List<RaidBoss>> raidBossMap = {};
        currentList.forEach((level, bosses) {
          if (bosses is List) {
            // Add checks for individual boss items
            final List<RaidBoss> validBosses = [];
             for (var i = 0; i < bosses.length; i++) {
                 final bossJson = bosses[i];
                 if (bossJson is Map<String, dynamic>) {
                     try {
                         validBosses.add(RaidBoss.fromJson(bossJson));
                     } catch (e, stackTrace) {
                         print('Error parsing RaidBoss for level $level at index $i: $e');
                         print('Problematic JSON item: $bossJson');
                         print('Stack trace: $stackTrace');
                         // Skip this boss or throw
                     }
                 } else {
                      print('Error fetching Raids: Expected a Map for boss at level $level index $i but got ${bossJson.runtimeType}');
                 }
             }
             if (validBosses.isNotEmpty) {
                raidBossMap[level] = validBosses;
             }

          } else {
              print('Error fetching Raids: Expected a List for level "$level" but got ${bosses.runtimeType}');
          }
        });
        return raidBossMap;
      } else {
        throw Exception('Failed to load Raid Bosses (Status code: ${response.statusCode})');
      }
    } catch (e) {
      print('Error fetching Raid Bosses: $e');
      rethrow;
    }
  }

    Future<List<Quest>> fetchQuests() async {
    try {
      final response = await _client.get(Uri.parse(ApiConfig.questsUrl));
      if (response.statusCode == 200) {
         final decodedBody = jsonDecode(utf8.decode(response.bodyBytes));

         if (decodedBody is! List) {
           print('Error fetching Quests: Expected a List but got ${decodedBody.runtimeType}');
           throw Exception('Unexpected JSON format for Quests: Expected a List');
         }

         final List<Quest> questList = [];
         for (var i = 0; i < decodedBody.length; i++) {
             final item = decodedBody[i];
             if (item is Map<String, dynamic>) {
                 try {
                     questList.add(Quest.fromJson(item));
                 } catch (e, stackTrace) {
                     print('Error parsing Quest at index $i: $e');
                     print('Problematic JSON item: $item');
                     print('Stack trace: $stackTrace');
                     // Skip or throw
                 }
             } else {
                  print('Error fetching Quests: Expected a Map at index $i but got ${item.runtimeType}');
             }
         }
         return questList;

      } else {
        throw Exception('Failed to load Quests (Status code: ${response.statusCode})');
      }
    } catch (e) {
      print('Error fetching Quests: $e');
      rethrow;
    }
  }

  void dispose() {
    _client.close(); // Close the client when the service is no longer needed
  }
}
