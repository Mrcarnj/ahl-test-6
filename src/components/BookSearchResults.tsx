// src/components/BookSearchResults.tsx
//
// The search results UI shared by the Rulebook and Situation Book screens: the
// bar that steps through hits, and the list of every hit.

import AntDesign from "@expo/vector-icons/AntDesign";
import React from "react";
import { Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { BookSearchHit } from "@/src/lib/bookSearch";

type NavBarProps = {
  results: BookSearchHit[];
  currentIndex: number;
  onPrevious: () => void;
  onNext: () => void;
  onShowResults: () => void;
};

export function BookSearchNavBar({
  results,
  currentIndex,
  onPrevious,
  onNext,
  onShowResults,
}: NavBarProps) {
  return (
    <View style={styles.navigationContainer}>
      <TouchableOpacity onPress={onPrevious}>
        <AntDesign name="up" size={24} color="#ff6600" />
      </TouchableOpacity>
      <Text style={styles.resultInfo}>
        {results[currentIndex].navLabel} ({currentIndex + 1} of {results.length})
      </Text>
      <TouchableOpacity onPress={onShowResults}>
        <Text style={styles.resultsButtonText}>Results</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onNext}>
        <AntDesign name="down" size={24} color="#ff6600" />
      </TouchableOpacity>
    </View>
  );
}

type ModalProps = {
  visible: boolean;
  searchTerm: string;
  results: BookSearchHit[];
  currentIndex: number;
  onSelect: (index: number) => void;
  onClose: () => void;
};

export function BookSearchResultsModal({
  visible,
  searchTerm,
  results,
  currentIndex,
  onSelect,
  onClose,
}: ModalProps) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <View style={styles.modalBackdrop}>
        <View style={styles.modalContent}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>
              Results for &quot;{searchTerm.trim()}&quot;
            </Text>
            <TouchableOpacity onPress={onClose}>
              <AntDesign name="close" size={20} color="#fff" />
            </TouchableOpacity>
          </View>
          <ScrollView showsVerticalScrollIndicator>
            {results.map((result, index) => (
              <React.Fragment key={`${result.page}-${index}`}>
                {result.isFuzzy && !results[index - 1]?.isFuzzy && (
                  <Text style={styles.resultDivider}>Similar matches</Text>
                )}
                <TouchableOpacity
                  style={[styles.resultRow, index === currentIndex && styles.resultRowActive]}
                  onPress={() => onSelect(index)}
                >
                  <Text style={styles.resultTitle}>{result.title}</Text>
                  <Text style={styles.resultMeta}>{result.subtitle}</Text>
                  <Text style={styles.resultSnippet}>{result.snippet}</Text>
                </TouchableOpacity>
              </React.Fragment>
            ))}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  navigationContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    backgroundColor: "#333",
  },
  resultInfo: {
    color: "#fff",
    fontSize: 16,
    marginHorizontal: 10,
  },
  resultsButtonText: {
    color: "#ff6600",
    fontSize: 14,
    marginHorizontal: 10,
    fontWeight: "600",
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "flex-end",
    backgroundColor: "rgba(0,0,0,0.35)",
  },
  modalContent: {
    maxHeight: "62%",
    backgroundColor: "#111",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  modalTitle: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
    paddingRight: 8,
    flex: 1,
  },
  resultRow: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#2a2a2a",
    padding: 10,
    marginBottom: 8,
    backgroundColor: "#1a1a1a",
  },
  resultRowActive: {
    borderColor: "#ff6600",
  },
  resultTitle: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "600",
  },
  resultDivider: {
    color: "#888",
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginTop: 8,
    marginBottom: 8,
  },
  resultMeta: {
    color: "#ff6600",
    fontSize: 13,
    marginTop: 2,
    marginBottom: 4,
  },
  resultSnippet: {
    color: "#bbb",
    fontSize: 13,
    lineHeight: 18,
  },
});
