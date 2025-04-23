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
      isShinyTarget: fields[3] as bool,
      isMegaTarget: fields[4] as bool,
      collectedMale: fields[5] as bool,
      collectedFemale: fields[6] as bool,
      collectedNormal: fields[7] as bool,
      notes: fields[8] as String?,
    );
  }

  @override
  void write(BinaryWriter writer, ListEntry obj) {
    writer
      ..writeByte(9)
      ..writeByte(0)
      ..write(obj.pokemonId)
      ..writeByte(1)
      ..write(obj.form)
      ..writeByte(2)
      ..write(obj.costume)
      ..writeByte(3)
      ..write(obj.isShinyTarget)
      ..writeByte(4)
      ..write(obj.isMegaTarget)
      ..writeByte(5)
      ..write(obj.collectedMale)
      ..writeByte(6)
      ..write(obj.collectedFemale)
      ..writeByte(7)
      ..write(obj.collectedNormal)
      ..writeByte(8)
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
    isShinyTarget: json['isShinyTarget'] as bool? ?? false,
    isMegaTarget: json['isMegaTarget'] as bool? ?? false,
    collectedMale: json['collectedMale'] as bool? ?? false,
    collectedFemale: json['collectedFemale'] as bool? ?? false,
    collectedNormal: json['collectedNormal'] as bool? ?? false,
    notes: json['notes'] as String?,
  );
}

Map<String, dynamic> _$ListEntryToJson(ListEntry instance) => <String, dynamic>{
      'pokemonId': instance.pokemonId,
      'form': instance.form,
      'costume': instance.costume,
      'isShinyTarget': instance.isShinyTarget,
      'isMegaTarget': instance.isMegaTarget,
      'collectedMale': instance.collectedMale,
      'collectedFemale': instance.collectedFemale,
      'collectedNormal': instance.collectedNormal,
      'notes': instance.notes,
    };
