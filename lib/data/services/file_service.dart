import 'dart:convert';
import 'dart:io'; // Requires dart:io, check web compatibility
import 'package:flutter/foundation.dart'; // For kIsWeb
import 'package:path_provider/path_provider.dart';
import 'package:file_picker/file_picker.dart';
import 'package:mydexpogo/data/models/custom_list.dart'; // Corrected import
import 'package:share_plus/share_plus.dart';
// Import dart:html conditionally for web download
// import 'dart:html' as html; // Requires additional setup for conditional import

class FileService {

  // --- Import ---
  Future<CustomList?> importList() async {
    try {
      FilePickerResult? result = await FilePicker.platform.pickFiles(
        type: FileType.custom,
        allowedExtensions: ['json'], // Only allow .json
      );

      if (result != null && result.files.single.path != null && !kIsWeb) {
        // On mobile/desktop, we get a path
        final path = result.files.single.path!;
        final file = File(path);
        final jsonString = await file.readAsString();
        final jsonMap = jsonDecode(jsonString);
        // Add validation: Check if root is a map and contains expected keys
        if (jsonMap is Map<String, dynamic> && jsonMap.containsKey('name') && jsonMap.containsKey('entries')) {
          return CustomList.fromJson(jsonMap);
        } else {
          throw Exception("Invalid JSON format: Missing required fields.");
        }

      } else if (result != null && result.files.single.bytes != null && kIsWeb) {
        // On web, we get bytes
        final bytes = result.files.single.bytes!;
        final jsonString = utf8.decode(bytes); // Assuming UTF-8
        final jsonMap = jsonDecode(jsonString);
        // Add validation
        if (jsonMap is Map<String, dynamic> && jsonMap.containsKey('name') && jsonMap.containsKey('entries')) {
          return CustomList.fromJson(jsonMap);
        } else {
          throw Exception("Invalid JSON format: Missing required fields.");
        }
      } else {
        // User canceled the picker or error occurred
        return null;
      }
    } catch (e) {
      print("Error importing list: $e");
      // Consider throwing a specific exception type
      throw Exception("Failed to import list file: ${e.toString()}");
    }
  }

  // --- Export ---
  Future<bool> exportList(CustomList list) async {
    try {
      // Ensure entries are properly encoded
      final jsonMap = list.toJson();
      final jsonString = jsonEncode(jsonMap);

      final listNameSanitized = list.name.replaceAll(RegExp(r'[^\w\s-]+'),'').replaceAll(' ', '_');
      final fileName = '${listNameSanitized}_pogolist.json';

      if (kIsWeb) {
        // Web Export: Trigger download
        // Requires dart:html and conditional import setup
        /*
        final bytes = utf8.encode(jsonString);
        final blob = html.Blob([bytes]);
        final url = html.Url.createObjectUrlFromBlob(blob);
        final anchor = html.AnchorElement(href: url)
          ..setAttribute("download", fileName)
          ..click();
        html.Url.revokeObjectUrl(url);
        return true; // Indicate success
        */
        print("Web export needs dart:html implementation.");
        // Fallback: Copy to clipboard? Or show text to user?
        return false; // Indicate web export not fully implemented here

      } else {
        // Mobile/Desktop Export: Save to temporary file and share
        final tempDir = await getTemporaryDirectory();
        final filePath = '${tempDir.path}/$fileName';
        final file = File(filePath);
        await file.writeAsString(jsonString);

        // Use share_plus to share the file
        final result = await Share.shareXFiles([XFile(filePath)], subject: 'Pokemon Go List: ${list.name}');

        // Optional: Clean up the temporary file after sharing
        // Consider deleting only on success?
        // try { await file.delete(); } catch (e) { print("Error deleting temp file: $e"); }

        print("Share result status: ${result.status}");
        // Check status if needed (e.g., ShareResultStatus.success)
        return result.status == ShareResultStatus.success;
      }
    } catch (e) {
      print("Error exporting list: $e");
      return false;
    }
  }
}