import { View, StyleSheet, Dimensions } from 'react-native';
import React from 'react';
import Pdf from 'react-native-pdf';

export default function Rulebook() {
    const source = {
        uri: 'https://zxjzdtepjpnunjkqrsjy.supabase.co/storage/v1/object/public/rules/2024-25%20NHL%20Situation%20Handbook%20(CONFIDENTIAL).pdf?t=2024-11-11T00%3A19%3A09.244Z',
        cache: true
    };

    return (
        <View style={styles.container}>
            <Pdf
                trustAllCerts={false}
                source={source}
                onLoadComplete={(numberOfPages, filePath) => {
                    console.log(`Number of pages: ${numberOfPages}`);
                }}
                onPageChanged={(page, numberOfPages) => {
                    console.log(`Current page: ${page}`);
                }}
                onError={(error) => {
                    console.log(error);
                }}
                onPressLink={(uri) => {
                    console.log(`Link pressed: ${uri}`);
                }}
                style={styles.pdf}
            />
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'flex-start',
        alignItems: 'center',
        backgroundColor: '#000',
    },
    pdf: {
        flex: 1,
        width: Dimensions.get('window').width,
        backgroundColor: '#000',
    }
});