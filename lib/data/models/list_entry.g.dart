// GENERATED CODE - DO NOT MODIFY BY HAND

part of 'list_entry.dart';

// **************************************************************************
// TypeAdapterGenerator
// **************************************************************************

class ListEntryAdapter extends TypeAdapter<ListEntry> {
  @override
  final int typeId = 1;

  @override
  ListEntry read(BinaryReader reader) {
    final numOfFields = reader.readByte();
    final fields = <int, dynamic>{
      for (int i = 0; i < numOfFields; i++) reader.readByte(): reader.read(),
    };
    return ListEntry(
      pokemonId: fields[0] as int,
      form: fields[1] as String?,
      costume: fields[2] as String?,
      collectedNormalMale: fields[3] as bool,
      collectedNormalFemale: fields[4] as bool,
      collectedShinyMale: fields[5] as bool,
      collectedShinyFemale: fields[6] as bool,
      notes: fields[7] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, ListEntry obj) {
    writer
      ..writeByte(8)
      ..writeByte(0)
      ..write(obj.pokemonId)
      ..writeByte(1)
      ..write(obj.form)
      ..writeByte(2)
      ..write(obj.costume)
      ..writeByte(3)
      ..write(obj.collectedNormalMale)
      ..writeByte(4)
      ..write(obj.collectedNormalFemale)
      ..writeByte(5)
      ..write(obj.collectedShinyMale)
      ..writeByte(6)
      ..write(obj.collectedShinyFemale)
      ..writeByte(7)
      ..write(obj.notes);
  }

  @override
  int get hashCode => typeId.hashCode;

  @override
  bool operator ==(Object other) =>
      identical(this, other) ||
      other is ListEntryAdapter &&
          runtimeType == other.runtimeType &&
          typeId == other.typeId;
}

// **************************************************************************
// JsonSerializableGenerator
// **************************************************************************

ListEntry _$ListEntryFromJson(Map<String, dynamic> json) {
  $checkKeys(
    json,
    requiredKeys: const ['pokemonId'],
  );
  return ListEntry(
    pokemonId: (json['pokemonId'] as num).toInt(),
    form: json['form'] as String?,
    costume: json['costume'] as String?,
    collectedNormalMale: json['collectedNormalMale'] as bool? ?? false,
    collectedNormalFemale: json['collectedNormalFemale'] as bool? ?? false,
    collectedShinyMale: json['collectedShinyMale'] as bool? ?? false,
    collectedShinyFemale: json['collectedShinyFemale'] as bool? ?? false,
    notes: json['notes'] as String?,
  );
}

Map<String, dynamic> _$ListEntryToJson(ListEntry instance) => <String, dynamic>{
      'pokemonId': instance.pokemonId,
      'form': instance.form,
      'costume': instance.costume,
      'collectedNormalMale': instance.collectedNormalMale,
      'collectedNormalFemale': instance.collectedNormalFemale,
      'collectedShinyMale': instance.collectedShinyMale,
      'collectedShinyFemale': instance.collectedShinyFemale,
      'notes': instance.notes,
    };
