import 'package:flutter/material.dart';
import 'package:cached_network_image/cached_network_image.dart';
import 'package:mydexpogo/config/api_config.dart'; // Corrected import
import 'package:mydexpogo/ui/widgets/loading_indicator.dart'; // Corrected import


// Helper function to display a fallback image (e.g., Pokéball or placeholder)
Widget fallbackPokemonImage(int dexNr, {double size = 50.0}) {
  // Option 1: Use the official artwork fallback URL
  // Handle dexNr 0 or invalid numbers
  final validDexNr = dexNr > 0 ? dexNr : 1; // Default to Bulbasaur if invalid
  final fallbackUrl = ApiConfig.fallbackPokemonImageUrl(validDexNr);
  return CachedNetworkImage(
    imageUrl: fallbackUrl,
    width: size,
    height: size,
    fit: BoxFit.contain,
    placeholder: (context, url) => LoadingIndicator(size: size * 0.6),
    errorWidget: (context, url, error) => Icon(Icons.catching_pokemon, size: size * 0.8, color: Colors.grey), // Final fallback icon
  );

  // Option 2: Simple Icon Fallback
  // return Icon(
  //   Icons.catching_pokemon, // Or Icons.question_mark
  //   size: size * 0.8, // Adjust icon size relative to container
  //   color: Colors.grey,
  // );
}